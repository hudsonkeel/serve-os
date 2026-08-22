// Community Roster Import + Reconciliation phase. Pass 1 established the
// read-only parse/preview path, reusing the EXISTING, unmodified
// matchPerson()/reconcileRoster() engine (lib/residents/roster/matching.ts,
// reconcile.ts) exactly as the legacy CLI script does. Pass 2 adds one
// orchestration step on top (communityRosterReconciliation.ts): composing
// that roster-specific verdict with Serve's newer canonical identity
// signals into one recommendation per row, and short-circuiting any row
// whose exact roster observation is already linked to a confirmed Serve
// resident (checked BEFORE matching runs, batched once per run — never
// per row). Still no resident is ever created or modified here — analysis
// stays read-only against `residents`; writes only happen from the
// explicit per-row review actions (lib/actions/communityRosterReview.ts).
import "server-only";
import {
  loadRosterWorkbookFromBuffer,
  hasBuildingSheets,
  parseBuildingSheets,
  parseDirectorySheet,
} from "./parseWorkbook.ts";
import { parseGenericRosterSheet } from "./parseGenericRoster.ts";
import { reconcileRoster } from "./reconcile.ts";
import { reconcileCommunityRosterOutcomes, ROSTER_RECONCILIATION_RULE_VERSION } from "./communityRosterReconciliation.ts";
import type { RosterReconciliationOutcome } from "./communityRosterReconciliation.ts";
import type { RawRosterRow, DirectoryRow } from "./types.ts";
import { loadLiveResidentsForCommunity, loadLiveResidentsExcludingCommunity } from "../../data/residentRoster.ts";
import { loadConfirmedAliases } from "../../data/residentIdentity.ts";
import { getPersonVendorIdentityLinksByVendorRecordIds } from "../../data/personVendorIdentityLinks.ts";
import type { RosterSourceRowInsert } from "../../data/residentRoster.ts";

export type RosterFormat = "watermere_building_sheets" | "generic_single_sheet";

export interface CommunityRosterAnalysisResult {
  readonly format: RosterFormat;
  readonly totalSourceRows: number;
  readonly sourceRowInserts: readonly RosterSourceRowInsert[];
  readonly invalidRows: readonly { sourceRowNumber: number; reason: string }[];
  readonly recognizedColumns: readonly string[];
  readonly unmappedColumns: readonly string[];
  readonly matchingRuleVersion: string;
  // How many rows were short-circuited by an already-confirmed identity
  // link before matching even ran — surfaced for the preview summary and
  // the Pass 2 verify script, never used to change behavior downstream.
  readonly alreadyLinkedCount: number;
}

// One occurrence index per (sourceRowNumber), so a couple row ("Bob &
// Pam" -> two PersonOutcomes sharing one sourceRowNumber) gets two
// distinct, stable, deterministic source_record_ids -- required by
// roster_source_rows_run_source_record_idx's uniqueness. Deterministic on
// re-analysis of identical data (section 113): same input order always
// produces the same occurrence indices.
function buildSourceRecordId(importRunId: string, sourceRowNumber: number, occurrenceIndex: number): string {
  return occurrenceIndex === 0
    ? `${importRunId}:${sourceRowNumber}`
    : `${importRunId}:${sourceRowNumber}:${occurrenceIndex}`;
}

function outcomeToInsert(
  sourceRecordId: string,
  outcome: RosterReconciliationOutcome,
  existingConfirmedResidentId: string | null
): RosterSourceRowInsert {
  const reviewNotes = [outcome.reason, outcome.directoryDiscrepancy, outcome.crossCommunityNote].filter(Boolean).join(" ") || null;

  return {
    sourceRowNumber: outcome.person.sourceRowNumber,
    sourceSheet: outcome.person.sourceSheet,
    sourceRecordId,
    rawPayload: {
      displayLabel: outcome.person.displayLabel,
      apartment: outcome.person.apartment,
      isPartOfCouple: outcome.person.isPartOfCouple,
      firstNameRaw: outcome.person.firstNameRaw,
      lastNameRaw: outcome.person.lastNameRaw,
    },
    normalizedPayload: {
      lastName: outcome.person.lastName,
      firstName: outcome.person.firstName,
      apartment: outcome.person.apartment,
    },
    resolutionStatus: outcome.classification,
    matchedResidentId: existingConfirmedResidentId ?? outcome.residentId,
    matchMethod: outcome.matchMethod,
    matchConfidence: outcome.matchConfidence,
    reviewNotes: existingConfirmedResidentId
      ? `Already linked to an existing Serve resident from a prior review of this exact roster row.`
      : reviewNotes,
    reviewState: existingConfirmedResidentId ? "committed" : undefined,
  };
}

export async function analyzeCommunityRosterFile(input: {
  importRunId: string;
  communityId: string;
  fileBytes: Buffer | ArrayBuffer;
}): Promise<CommunityRosterAnalysisResult> {
  const workbook = loadRosterWorkbookFromBuffer(input.fileBytes);

  let rawRows: RawRosterRow[];
  let directoryRows: DirectoryRow[];
  let format: RosterFormat;
  let invalidRows: { sourceRowNumber: number; reason: string }[] = [];
  let recognizedColumns: string[] = [];
  let unmappedColumns: string[] = [];

  if (hasBuildingSheets(workbook)) {
    format = "watermere_building_sheets";
    rawRows = parseBuildingSheets(workbook);
    directoryRows = parseDirectorySheet(workbook);
  } else {
    format = "generic_single_sheet";
    const parsed = parseGenericRosterSheet(workbook);
    rawRows = [...parsed.rows];
    directoryRows = [];
    invalidRows = [...parsed.invalidRows];
    recognizedColumns = parsed.recognizedColumns.map((c) => `${c.header} → ${c.field}`);
    unmappedColumns = [...parsed.unmappedColumns];
  }

  // Batch-loaded once per run, never per row (Part 2 item 4): this
  // community's live residents, every OTHER community's live residents
  // (for the cross-community informational pass), and confirmed aliases.
  const [liveResidents, crossCommunityResidents, confirmedAliases] = await Promise.all([
    loadLiveResidentsForCommunity(input.communityId),
    loadLiveResidentsExcludingCommunity(input.communityId),
    loadConfirmedAliases(),
  ]);

  const result = reconcileRoster(rawRows, directoryRows, liveResidents, confirmedAliases);

  // Compose the roster engine's own verdicts with canonical identity
  // signals — one recommendation per row (communityRosterReconciliation.ts).
  const reconciledOutcomes = reconcileCommunityRosterOutcomes(result.personOutcomes, {
    communityCandidates: liveResidents,
    communityId: input.communityId,
    crossCommunityCandidates: crossCommunityResidents,
    confirmedAliases,
  });

  // Deterministic per-row source identity, computed before the
  // existing-link check so that check is keyed by the exact same id this
  // row will be persisted (and re-analyzed) under.
  const occurrenceBySourceRow = new Map<number, number>();
  const withSourceRecordId = reconciledOutcomes.map((outcome) => {
    const rowNum = outcome.person.sourceRowNumber;
    const occurrenceIndex = occurrenceBySourceRow.get(rowNum) ?? 0;
    occurrenceBySourceRow.set(rowNum, occurrenceIndex + 1);
    return { outcome, sourceRecordId: buildSourceRecordId(input.importRunId, rowNum, occurrenceIndex) };
  });

  // Existing-source-link short-circuit (Part 2 item 1) — one batch query
  // for every row in this run, checked BEFORE the preview is ever shown.
  // A CONFIRMED link means this exact roster observation was already
  // resolved (e.g. a retry re-analysis of the same run after a prior
  // review pass); it is never re-surfaced for review. A 'proposed' /
  // 'rejected' / 'deferred' link means a decision is in flight or was
  // deliberately postponed/declined — left as a normal review row (its
  // own resolution_status/reason still stands), never silently resolved
  // on the row's behalf.
  const existingLinks = await getPersonVendorIdentityLinksByVendorRecordIds(
    "community_roster",
    "resident",
    withSourceRecordId.map((w) => w.sourceRecordId)
  );
  const confirmedResidentBySourceRecordId = new Map(
    existingLinks.filter((l) => l.status === "confirmed" && l.subject_id).map((l) => [l.vendor_record_id, l.subject_id as string])
  );

  const sourceRowInserts: RosterSourceRowInsert[] = withSourceRecordId.map(({ outcome, sourceRecordId }) =>
    outcomeToInsert(sourceRecordId, outcome, confirmedResidentBySourceRecordId.get(sourceRecordId) ?? null)
  );

  return {
    format,
    totalSourceRows: result.totalSourceRows,
    sourceRowInserts,
    matchingRuleVersion: ROSTER_RECONCILIATION_RULE_VERSION,
    alreadyLinkedCount: confirmedResidentBySourceRecordId.size,
    invalidRows,
    recognizedColumns,
    unmappedColumns,
  };
}
