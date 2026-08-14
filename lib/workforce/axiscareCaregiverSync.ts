// AxisCare caregiver roster sync — the one function behind both
// scripts/workforce-sync-caregivers.ts and the "Sync Now" server action.
// See supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql
// for the full schema/RPC design this orchestrates.
//
// Never creates or updates a workforce_members row directly — only a human
// confirming a proposed identity link does that (see
// lib/actions/workforce.ts). This function only ever writes to
// person_vendor_identity_links (via the sync_axiscare_vendor_identity RPC),
// workforce_axiscare_sync_runs, and — only for an actual, changed refresh —
// workforce_activity.
import { createServerClient } from "../supabase/server.ts";
import { isAxisCareWorkforceEnabled } from "../integrations/axiscare/config.ts";
import { getAllCaregivers } from "../integrations/axiscare/caregivers.ts";
import { applyAxisCareFieldAllowlist, extractAxisCareCaregiverIdentity, type AxisCareApprovedCaregiverData } from "./axiscareFieldAllowlist.ts";
import { findWorkforceMemberCandidateByContact } from "./identityMatching.ts";
import { getPersonVendorIdentityLinkById, syncAxisCareVendorIdentity } from "../data/personVendorIdentityLinks.ts";
import { recordWorkforceActivity } from "../data/workforceActivity.ts";
import { getWorkforceMemberById, syncSeedOrCorrectWorkforceCanonicalField } from "../data/workforceMembers.ts";
import { flagWorkforceProfileDiscrepancy } from "../data/workforceProfileDiscrepancies.ts";
import { evaluateCanonicalFieldSyncAction, isCanonicalProfileReviewed } from "./canonicalProfileSync.ts";
import type { WorkforceAxisCareSyncRun, WorkforceMember } from "../supabase/types.ts";

// The AxisCare-sourced field each sync-comparable canonical field maps to
// — see the Canonical Profile Editor scope's section 9. display_name is
// deliberately NOT compared here (it's a derived join with no single
// AxisCare source field); only these five, matching the acceptance
// test's own "surname" framing.
const CANONICAL_SYNC_FIELD_MAP: Array<{
  canonicalField: "legal_first_name" | "legal_last_name" | "preferred_name" | "primary_email" | "primary_phone";
  sourceValue: (data: AxisCareApprovedCaregiverData) => string | null;
}> = [
  { canonicalField: "legal_first_name", sourceValue: (d) => d.firstName },
  { canonicalField: "legal_last_name", sourceValue: (d) => d.lastName },
  { canonicalField: "preferred_name", sourceValue: (d) => d.goesBy },
  { canonicalField: "primary_email", sourceValue: (d) => d.personalEmail },
  { canonicalField: "primary_phone", sourceValue: (d) => d.mobilePhone ?? d.homePhone },
];

const SYNC_ACTOR = "AxisCare Sync";

// Applies the deterministic seed/auto-correct/flag-discrepancy rule (see
// evaluateCanonicalFieldSyncAction) to every sync-comparable canonical
// field, for the PRIMARY AxisCare identity only — a duplicate/retired
// link's data changing must never touch the canonical profile it doesn't
// drive. Never throws; the caller already wraps each caregiver in its own
// try/catch.
async function applyCanonicalProfileSyncProtection(member: WorkforceMember, sourceData: AxisCareApprovedCaregiverData): Promise<void> {
  const reviewed = isCanonicalProfileReviewed(member.canonical_profile_status);

  for (const { canonicalField, sourceValue } of CANONICAL_SYNC_FIELD_MAP) {
    const source = sourceValue(sourceData);
    const canonical = member[canonicalField];
    const action = evaluateCanonicalFieldSyncAction(canonical, reviewed, source);

    if (action === "seed" || action === "auto_correct_capitalization") {
      await syncSeedOrCorrectWorkforceCanonicalField({
        workforceMemberId: member.id,
        fieldName: canonicalField,
        newValue: source as string,
        actor: SYNC_ACTOR,
      });
    } else if (action === "flag_discrepancy") {
      await flagWorkforceProfileDiscrepancy({
        workforceMemberId: member.id,
        fieldName: canonicalField,
        canonicalValue: canonical,
        sourceValue: source,
        sourceSystem: "axiscare",
        actor: SYNC_ACTOR,
      });
    }
  }
}

export interface AxisCareCaregiverSyncSummary {
  syncRunId: string;
  // "disabled" is deliberately distinct from "failed" — a feature-flag-off
  // environment is a normal, intentional configuration state (same
  // philosophy as isAxisCareScheduleEnabled()'s "calm external-launch
  // panel, not an error state"), not an integration problem. Keeping it a
  // separate literal (rather than folding it into "failed") is what lets
  // the UI (see lib/workforce/syncStatusDisplay.ts) tell an admin "this is
  // config, not a break" without parsing the error message text.
  status: "success" | "partial" | "failed" | "disabled";
  recordsReceived: number;
  sourceRecordsRefreshed: number;
  sourceRecordsUnchanged: number;
  reviewCandidatesCreated: number;
  skippedExistingDecisions: number;
  errors: Array<{ vendorRecordId: string | null; message: string }>;
  truncated: boolean;
}

async function startSyncRun(initiatedBy: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("workforce_axiscare_sync_runs")
    .insert({ status: "in_progress", initiated_by: initiatedBy })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[axiscareCaregiverSync] could not start sync run", { message: error?.message });
    return null;
  }
  return data.id as string;
}

async function completeSyncRun(
  syncRunId: string,
  summary: Omit<AxisCareCaregiverSyncSummary, "syncRunId" | "truncated">
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from("workforce_axiscare_sync_runs")
    .update({
      status: summary.status,
      completed_at: new Date().toISOString(),
      records_received: summary.recordsReceived,
      source_records_refreshed: summary.sourceRecordsRefreshed,
      source_records_unchanged: summary.sourceRecordsUnchanged,
      review_candidates_created: summary.reviewCandidatesCreated,
      errors: summary.errors,
    })
    .eq("id", syncRunId);
}

export async function syncAxisCareCaregivers(initiatedBy: string): Promise<AxisCareCaregiverSyncSummary> {
  // Checked before any credential lookup, same discipline as
  // todaysSchedule.ts — a disabled feature must be indistinguishable from
  // a misconfigured one, and must never reveal whether credentials exist.
  if (!isAxisCareWorkforceEnabled()) {
    return {
      syncRunId: "",
      status: "disabled",
      recordsReceived: 0,
      sourceRecordsRefreshed: 0,
      sourceRecordsUnchanged: 0,
      reviewCandidatesCreated: 0,
      skippedExistingDecisions: 0,
      errors: [{ vendorRecordId: null, message: "Workforce AxisCare sync is not enabled." }],
      truncated: false,
    };
  }

  const syncRunId = await startSyncRun(initiatedBy);
  if (!syncRunId) {
    return {
      syncRunId: "",
      status: "failed",
      recordsReceived: 0,
      sourceRecordsRefreshed: 0,
      sourceRecordsUnchanged: 0,
      reviewCandidatesCreated: 0,
      skippedExistingDecisions: 0,
      errors: [{ vendorRecordId: null, message: "Could not create sync run row" }],
      truncated: false,
    };
  }

  let allCaregivers: Awaited<ReturnType<typeof getAllCaregivers>>;
  try {
    allCaregivers = await getAllCaregivers();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AxisCare fetch failure";
    await completeSyncRun(syncRunId, {
      status: "failed",
      recordsReceived: 0,
      sourceRecordsRefreshed: 0,
      sourceRecordsUnchanged: 0,
      reviewCandidatesCreated: 0,
      skippedExistingDecisions: 0,
      errors: [{ vendorRecordId: null, message }],
    });
    return {
      syncRunId,
      status: "failed",
      recordsReceived: 0,
      sourceRecordsRefreshed: 0,
      sourceRecordsUnchanged: 0,
      reviewCandidatesCreated: 0,
      skippedExistingDecisions: 0,
      errors: [{ vendorRecordId: null, message }],
      truncated: false,
    };
  }

  let sourceRecordsRefreshed = 0;
  let sourceRecordsUnchanged = 0;
  let reviewCandidatesCreated = 0;
  let skippedExistingDecisions = 0;
  const errors: Array<{ vendorRecordId: string | null; message: string }> = [];

  // Every record is processed independently — one bad record never stops
  // the rest of the roster from syncing.
  for (const raw of allCaregivers.records) {
    const { vendorRecordId, vendorDisplayName } = extractAxisCareCaregiverIdentity(raw);
    if (!vendorRecordId) {
      errors.push({ vendorRecordId: null, message: "Caregiver record has no usable id field" });
      continue;
    }

    try {
      const approvedSourceData = applyAxisCareFieldAllowlist(raw);

      const candidate = await findWorkforceMemberCandidateByContact({
        email: approvedSourceData.personalEmail,
        phone: approvedSourceData.mobilePhone ?? approvedSourceData.homePhone,
        firstName: approvedSourceData.firstName,
        lastName: approvedSourceData.lastName,
      });

      const result = await syncAxisCareVendorIdentity({
        vendorRecordId,
        vendorDisplayName,
        matchMethod: candidate?.matchMethod ?? "name_similarity_pending_review",
        matchConfidence: candidate?.matchConfidence ?? "low",
        candidateSubjectId: candidate?.workforceMemberId ?? null,
        approvedSourceData: approvedSourceData as unknown as Record<string, unknown>,
      });

      if (result.error) {
        errors.push({ vendorRecordId, message: result.error });
        continue;
      }

      // For a confirmed link, only the PRIMARY identity may drive the
      // canonical profile — a duplicate/retired record's data changing
      // must never seed/correct/flag against a profile it doesn't own.
      // Runs for both 'refreshed' and 'unchanged': the canonical profile
      // can be out of sync with an already-current vendor snapshot too
      // (e.g. right after this feature ships), not only on a fresh
      // vendor-side change.
      if ((result.action === "refreshed" || result.action === "unchanged") && result.workforceMemberId && result.linkId) {
        const link = await getPersonVendorIdentityLinkById(result.linkId);
        if (link?.link_role === "primary") {
          const member = await getWorkforceMemberById(result.workforceMemberId);
          if (member) {
            await applyCanonicalProfileSyncProtection(member, approvedSourceData);
          }
        }
      }

      switch (result.action) {
        case "refreshed":
          sourceRecordsRefreshed += 1;
          if (result.workforceMemberId) {
            await recordWorkforceActivity({
              workforceMemberId: result.workforceMemberId,
              eventType: "axiscare_source_data_refreshed",
              eventTitle: "AxisCare data refreshed",
              eventDescription: "This caregiver's AxisCare-sourced fields were updated during a sync run.",
              source: "workforce_axiscare_sync_runs",
              systemGenerated: true,
            });
          }
          break;
        case "unchanged":
          sourceRecordsUnchanged += 1;
          break;
        case "proposed":
          reviewCandidatesCreated += 1;
          break;
        case "skipped_existing_decision":
          skippedExistingDecisions += 1;
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error processing caregiver record";
      errors.push({ vendorRecordId, message });
    }
  }

  const status: "success" | "partial" | "failed" =
    errors.length === 0 ? "success" : errors.length === allCaregivers.records.length ? "failed" : "partial";

  await completeSyncRun(syncRunId, {
    status,
    recordsReceived: allCaregivers.records.length,
    sourceRecordsRefreshed,
    sourceRecordsUnchanged,
    reviewCandidatesCreated,
    skippedExistingDecisions,
    errors,
  });

  return {
    syncRunId,
    status,
    recordsReceived: allCaregivers.records.length,
    sourceRecordsRefreshed,
    sourceRecordsUnchanged,
    reviewCandidatesCreated,
    skippedExistingDecisions,
    errors,
    truncated: allCaregivers.truncated,
  };
}

export async function getLatestSyncRun(): Promise<WorkforceAxisCareSyncRun | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("workforce_axiscare_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getLatestSyncRun]", { message: error.message });
    return null;
  }
  return (data as WorkforceAxisCareSyncRun | null) ?? null;
}

// Pure — never touches the network. Picks the most recent status: "success"
// run from an already-fetched list, regardless of what (if anything) ran
// after it. Exported separately from getLatestSuccessfulSyncRun() below so
// this decision logic ("a later failed run must never hide/overwrite the
// last real success") is directly unit-testable without a live database —
// see lib/workforce/__tests__/axiscareCaregiverSync.test.ts. Does not
// assume the input is pre-sorted.
export function pickLatestSuccessfulSyncRun(
  runs: WorkforceAxisCareSyncRun[]
): WorkforceAxisCareSyncRun | null {
  const successes = runs.filter((r) => r.status === "success");
  if (successes.length === 0) return null;
  return successes.reduce((latest, run) => (run.started_at > latest.started_at ? run : latest));
}

// Bounded lookback (not a single most-recent-row query) so a run of failed/
// disabled attempts after the last real success doesn't require an
// unbounded scan to find it — 50 is comfortably more than this feature has
// ever produced in a day of manual "Sync Now" clicks, matching the same
// "safety net, not a hard business limit" discipline as getAllCaregivers()'s
// MAX_CAREGIVER_PAGES.
const SUCCESSFUL_RUN_LOOKBACK = 50;

export async function getLatestSuccessfulSyncRun(): Promise<WorkforceAxisCareSyncRun | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("workforce_axiscare_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(SUCCESSFUL_RUN_LOOKBACK);

  if (error) {
    console.error("[getLatestSuccessfulSyncRun]", { message: error.message });
    return null;
  }
  return pickLatestSuccessfulSyncRun((data as WorkforceAxisCareSyncRun[] | null) ?? []);
}
