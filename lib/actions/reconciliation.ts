"use server";

// Governed correction actions for the Reconciliation workflow
// (/reconciliation). Reuses the existing, already-in-production
// identity-link and disposition RPC infrastructure — no second identity
// system, no new tables. Every action here requires an authorized actor
// (admin/manager/executive, same boundary as resident profile edits)
// and, for anything that changes durable state, a rationale — enforced
// both here and again at the database layer (the underlying RPCs
// themselves reject a missing actor/rationale).
import { revalidatePath } from "next/cache";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { syncAxisCareClientIdentity } from "@/lib/data/residentAxisCareLinks";
import {
  confirmPersonVendorIdentityLink,
  rejectPersonVendorIdentityLink,
  deferPersonVendorIdentityLink,
} from "@/lib/data/personVendorIdentityLinks";
import { setAxisCareClientDisposition } from "@/lib/data/axiscareClientDispositions";
import { toPersonVendorIdentityLinksMatchMethod, type ClientMatchBasis } from "@/lib/integrations/axiscare/clientIdentityMatching";
import type { AxisCareClientDisposition } from "@/lib/integrations/axiscare/clientDisposition";
import { syncOneConfirmedResident } from "@/lib/data/axiscareClientSync";

type ReconciliationActionResult = { error?: string; success?: boolean; syncWarning?: string };

async function requireReconciliationActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to make reconciliation decisions." };
  }
  return { actor: profile.full_name?.trim() || profile.email };
}

export interface AxisCareIdentityCandidateInput {
  axiscareId: string;
  vendorDisplayName: string;
  matchBasis: ClientMatchBasis;
  residentId: string;
  statusLabel: string | null;
  statusActive: boolean;
  classes: string[];
}

// Every reconciliation identity decision starts here — creates the
// 'proposed' link row if none exists yet (the common case: these are
// fresh, human-reviewed matches the automated sync never wrote,
// precisely because they required review). Idempotent: if a decision
// already exists for this AxisCare record, sync_axiscare_client_identity
// reports back rather than reopening it (see
// scripts/syncAxisCareClientIdentities.ts's own established behavior).
async function ensureProposedLink(input: AxisCareIdentityCandidateInput): Promise<{ linkId: string } | { error: string }> {
  if (input.matchBasis === "none") {
    return { error: "No match basis on file — cannot create an identity link without one." };
  }

  const result = await syncAxisCareClientIdentity({
    vendorRecordId: input.axiscareId,
    vendorDisplayName: input.vendorDisplayName,
    matchMethod: toPersonVendorIdentityLinksMatchMethod(input.matchBasis),
    // Reconciliation-initiated matches are, by definition, the ones that
    // did not clear the fully-deterministic bar the automated sync
    // requires — "medium", not "high".
    matchConfidence: "medium",
    candidateSubjectId: input.residentId,
    approvedSourceData: {
      statusLabel: input.statusLabel,
      statusActive: input.statusActive,
      classes: input.classes,
    },
  });

  if (result.error || !result.linkId) {
    return { error: result.error ?? "Could not create a pending identity link for this record." };
  }
  return { linkId: result.linkId };
}

function revalidatePeopleWeServe(residentId?: string) {
  revalidatePath("/reconciliation");
  revalidatePath("/clients");
  revalidatePath("/residents");
  // revalidatePath("/residents") does not itself cover the dynamic
  // [id] detail route — identity decisions can now be made directly from
  // that page (see components/residents/ResidentIdentityAndRelationship.tsx),
  // so its own path needs an explicit revalidate too.
  if (residentId) revalidatePath(`/residents/${residentId}`);
}

export async function confirmAxisCareResidentIdentity(
  input: AxisCareIdentityCandidateInput,
  rationale?: string
): Promise<ReconciliationActionResult> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const linkResult = await ensureProposedLink(input);
  if ("error" in linkResult) return linkResult;

  const { error } = await confirmPersonVendorIdentityLink({
    linkId: linkResult.linkId,
    subjectId: input.residentId,
    actor: actorResult.actor,
    rationale,
  });
  if (error) return { error };

  // Identity confirmation succeeded — that decision is durable and final
  // regardless of what happens next. AxisCare Client Data Sync runs
  // automatically from here so a user never has to know a separate sync
  // step exists, but a sync failure (e.g. AxisCare temporarily
  // unreachable) must never look like the identity decision itself
  // failed — it did not. Surfaced as an honest, non-blocking warning; the
  // resident stays picked up by the next scheduled/manual sync regardless.
  let syncWarning: string | undefined;
  try {
    const syncResult = await syncOneConfirmedResident(input.residentId, input.axiscareId, actorResult.actor, "identity_confirmation");
    if (syncResult.status === "failed") {
      syncWarning = `Identity confirmed, but AxisCare data sync could not complete: ${syncResult.error ?? "unknown error"}. It will retry on the next sync.`;
    } else if (syncResult.status === "synced_with_conflicts") {
      syncWarning = `Identity confirmed. AxisCare data synced, but ${syncResult.conflicts.length} field${syncResult.conflicts.length === 1 ? "" : "s"} disagree with Serve's existing values and need review.`;
    }
  } catch (err) {
    syncWarning = `Identity confirmed, but AxisCare data sync could not complete: ${err instanceof Error ? err.message : "unknown error"}. It will retry on the next sync.`;
  }

  revalidatePeopleWeServe(input.residentId);
  return { success: true, syncWarning };
}

export async function rejectAxisCareResidentIdentity(
  input: AxisCareIdentityCandidateInput,
  rationale: string
): Promise<ReconciliationActionResult> {
  if (!rationale.trim()) return { error: "A rationale is required to record that this is not the same person." };
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const linkResult = await ensureProposedLink(input);
  if ("error" in linkResult) return linkResult;

  const { error } = await rejectPersonVendorIdentityLink({ linkId: linkResult.linkId, actor: actorResult.actor, rationale });
  if (error) return { error };

  revalidatePeopleWeServe(input.residentId);
  return { success: true };
}

export async function deferAxisCareResidentIdentity(
  input: AxisCareIdentityCandidateInput,
  rationale: string
): Promise<ReconciliationActionResult> {
  if (!rationale.trim()) return { error: "A rationale is required to defer this decision." };
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const linkResult = await ensureProposedLink(input);
  if ("error" in linkResult) return linkResult;

  const { error } = await deferPersonVendorIdentityLink({ linkId: linkResult.linkId, actor: actorResult.actor, rationale });
  if (error) return { error };

  revalidatePeopleWeServe(input.residentId);
  return { success: true };
}

export interface ClassifyAxisCareClientInput {
  axiscareId: string;
  disposition: AxisCareClientDisposition;
  rationale: string;
  relatedAxisCareClientId?: string | null;
  relatedPersonNote?: string | null;
}

export async function classifyAxisCareClientRecord(input: ClassifyAxisCareClientInput): Promise<ReconciliationActionResult> {
  if (!input.rationale.trim()) return { error: "A rationale is required to classify a vendor record." };
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const { error } = await setAxisCareClientDisposition({
    axiscareClientId: input.axiscareId,
    disposition: input.disposition,
    rationale: input.rationale,
    actor: actorResult.actor,
    relatedAxisCareClientId: input.relatedAxisCareClientId,
    relatedPersonNote: input.relatedPersonNote,
  });
  if (error) return { error };

  revalidatePeopleWeServe();
  return { success: true };
}

// ─── Exclude / Excluded Records — a simplified, single-click front door
// onto the same governed disposition mechanism above (classifyAxisCareClientRecord).
// "Exclude" is not a new taxonomy — it always writes disposition =
// 'administrative_record', the existing value that already computes to
// operationalBucket: 'excluded' (see isExcludedFromLifecycleCounts,
// lib/integrations/axiscare/clientDisposition.ts). A user excluding an
// obviously irrelevant record should never have to pick from the full
// 6-option disposition list. Rationale stays required at the schema
// layer (person_evidence_... no — axiscare_client_dispositions.rationale
// is NOT NULL) but is optional from the USER's perspective: a sensible
// default is substituted when they don't type one, satisfying the
// constraint without demanding detail for an obvious case. ────────────

const DEFAULT_EXCLUDE_RATIONALE =
  "Excluded — reviewed and determined not to represent a relevant Serve operational person/relationship.";
const DEFAULT_RESTORE_RATIONALE = "Restored from Excluded Records for re-review.";

export async function quickExcludeAxisCareRecord(axiscareId: string, rationale?: string): Promise<ReconciliationActionResult> {
  return classifyAxisCareClientRecord({
    axiscareId,
    disposition: "administrative_record",
    rationale: rationale?.trim() || DEFAULT_EXCLUDE_RATIONALE,
  });
}

export async function bulkExcludeAxisCareRecords(
  axiscareIds: string[],
  rationale?: string
): Promise<ReconciliationActionResult & { excludedCount?: number; failedIds?: string[] }> {
  if (axiscareIds.length === 0) return { error: "No records selected." };

  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const failedIds: string[] = [];
  for (const axiscareId of axiscareIds) {
    const { error } = await setAxisCareClientDisposition({
      axiscareClientId: axiscareId,
      disposition: "administrative_record",
      rationale: rationale?.trim() || DEFAULT_EXCLUDE_RATIONALE,
      actor: actorResult.actor,
    });
    if (error) failedIds.push(axiscareId);
  }

  revalidatePeopleWeServe();
  if (failedIds.length > 0) {
    return {
      error: `${failedIds.length} of ${axiscareIds.length} record(s) could not be excluded.`,
      excludedCount: axiscareIds.length - failedIds.length,
      failedIds,
    };
  }
  return { success: true, excludedCount: axiscareIds.length };
}

// Suppression, not deletion — restoring puts the record back into
// ordinary review (disposition: 'needs_review'), never asserts a new
// classification on the user's behalf.
export async function restoreAxisCareRecord(axiscareId: string, rationale?: string): Promise<ReconciliationActionResult> {
  return classifyAxisCareClientRecord({
    axiscareId,
    disposition: "needs_review",
    rationale: rationale?.trim() || DEFAULT_RESTORE_RATIONALE,
  });
}
