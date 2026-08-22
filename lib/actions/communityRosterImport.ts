"use server";

// Community Roster Import + Reconciliation phase. Pass 1 built upload,
// analyze, preview — read-only against `residents`. Pass 2 (below the
// Pass 1 section) adds the confirm/reject/defer/mark-invalid/create-resident
// actions that write to person_vendor_identity_links and residents.
// Parallel to lib/actions/reconciliation.ts, never a modification of it —
// AxisCare's own confirm/reject/defer flow is completely unaffected by
// anything in this file; every write below goes through the exact same
// governed, source-generic RPCs that file already uses
// (confirm/reject/defer_person_vendor_identity_link,
// create_resident_from_external_source), just with source_system =
// 'community_roster' instead of 'axiscare'. No second identity mechanism.
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { listCommunities, getCommunityById } from "@/lib/data/communities";
import { isCommunityAccessAuthorized } from "@/lib/auth/communityScope";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import type { AuthRole } from "@/lib/auth/constants";
import {
  validateRosterFile,
  buildRosterStoragePath,
  uploadRosterFileBytes,
  getSignedRosterFileUrl,
} from "@/lib/residents/roster/rosterFileStorage";
import {
  createCommunityRosterImportRun,
  updateRosterImportRunStatus,
  updateRosterImportRunStoragePath,
  updateRosterImportRunMatchingRuleVersion,
  getRosterImportRunStoragePath,
  insertCommunityRosterSourceRows,
  findCommittedRosterImportRunByHash,
  getRosterImportRunById,
  listCommunityRosterImportRuns,
  getRosterSourceRowsForRun,
  getRosterSourceRowById,
  updateRosterSourceRowDecision,
  finalizeRosterImportRun,
  deleteRosterImportRun,
  getUnresolvedCommunityRosterSourceRows,
} from "@/lib/data/residentRoster";
import { analyzeCommunityRosterFile } from "@/lib/residents/roster/communityRosterAnalysis";
import {
  syncExternalPersonIdentity,
  confirmPersonVendorIdentityLink,
  rejectPersonVendorIdentityLink,
  deferPersonVendorIdentityLink,
  hasConfirmedPrimaryVendorIdentityLink,
} from "@/lib/data/personVendorIdentityLinks";
import { createResidentFromExternalSource } from "@/lib/data/residentCreationFromSource";
import { findFreshCredibleResidentMatch } from "@/lib/data/axiscareClientOperationalSummary";
import type { VendorIdentityMatchConfidence, VendorIdentityMatchMethod, Community } from "@/lib/supabase/types";

const ROSTER_SOURCE_SYSTEM = "community_roster";

type ActionResult = { error?: string; success?: boolean };

async function requireRosterImportActor(): Promise<{ actor: string; role: AuthRole } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to import a community roster." };
  }
  return { actor: profile.full_name?.trim() || profile.email, role: profile.role };
}

// Server-side re-validation of the operator-submitted community — never a
// trusted client ID (section 57). Reuses the exact shared authorization
// helper every other community-scoped action already uses, rather than
// hard-coding "every role may access every community."
async function requireAuthorizedCommunity(communityId: string, role: AuthRole): Promise<{ community: Community } | { error: string }> {
  const communities = await listCommunities();
  const activeCommunityIds = new Set(communities.map((c) => c.id));
  const authorized = isCommunityAccessAuthorized({ role, communityId, activeCommunityIds });
  if (!authorized) return { error: "You are not authorized to import a roster for this community." };
  const community = await getCommunityById(communityId);
  if (!community) return { error: "Select a community before importing." };
  return { community };
}

export interface UploadCommunityRosterResult extends ActionResult {
  runId?: string;
  alreadyImported?: { runId: string; importedAt: string };
}

export async function uploadCommunityRoster(formData: FormData): Promise<UploadCommunityRosterResult> {
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const communityId = String(formData.get("communityId") ?? "");
  if (!communityId) return { error: "Select a community before importing." };

  const communityResult = await requireAuthorizedCommunity(communityId, actorResult.role);
  if ("error" in communityResult) return communityResult;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided." };

  const validation = validateRosterFile({ size: file.size, type: file.type, name: file.name });
  if (!validation.ok) return { error: validation.error };

  const bytes = await file.arrayBuffer();
  const sourceHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

  // Idempotent re-upload short-circuit (section 25/92/93) — a
  // byte-identical file already committed for this community is never
  // silently reprocessed.
  const existing = await findCommittedRosterImportRunByHash(communityId, sourceHash);
  if (existing) {
    return { alreadyImported: { runId: existing.id, importedAt: existing.importedAt } };
  }

  const runResult = await createCommunityRosterImportRun({
    communityId,
    communityCode: communityResult.community.code,
    sourceFilename: file.name,
    sourceHash,
    // Patched immediately below, once the run id exists to build a path from.
    storagePath: "",
    importedBy: actorResult.actor,
  });
  if (runResult.error || !runResult.id) return { error: runResult.error ?? "Could not create the import run." };

  const storagePath = buildRosterStoragePath({ communityId, importRunId: runResult.id, originalFilename: file.name });
  const uploadResult = await uploadRosterFileBytes(storagePath, bytes, file.type);
  if (uploadResult.error) {
    await updateRosterImportRunStatus(runResult.id, "failed");
    return { error: uploadResult.error };
  }
  await updateRosterImportRunStoragePath(runResult.id, storagePath);

  revalidatePath("/residents/roster-import");
  return { success: true, runId: runResult.id };
}

export interface AnalyzeCommunityRosterResult extends ActionResult {
  totalSourceRows?: number;
  format?: string;
  invalidRowCount?: number;
  unmappedColumns?: string[];
}

export async function analyzeCommunityRosterImport(runId: string): Promise<AnalyzeCommunityRosterResult> {
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const run = await getRosterImportRunById(runId);
  if (!run || !run.communityId) return { error: "Roster import not found." };

  const communityResult = await requireAuthorizedCommunity(run.communityId, actorResult.role);
  if ("error" in communityResult) return communityResult;

  // Re-fetch the uploaded file from storage to parse it — never trusts
  // anything client-submitted at this step; the file bytes are already
  // durably stored from the upload step.
  const storagePath = await getRosterImportRunStoragePath(runId);
  if (!storagePath) return { error: "The uploaded file could not be found for this import." };

  const signedUrlResult = await getSignedRosterFileUrl(storagePath);
  if (signedUrlResult.error || !signedUrlResult.url) return { error: signedUrlResult.error ?? "Could not access the uploaded file." };

  const fileResponse = await fetch(signedUrlResult.url);
  if (!fileResponse.ok) return { error: "Could not read the uploaded roster file." };
  const fileBytes = await fileResponse.arrayBuffer();

  const analysis = await analyzeCommunityRosterFile({ importRunId: runId, communityId: run.communityId, fileBytes });

  const insertResult = await insertCommunityRosterSourceRows(runId, analysis.sourceRowInserts);
  if (insertResult.error) return { error: insertResult.error };

  await Promise.all([
    updateRosterImportRunStatus(runId, "pending_review", { totalSourceRows: analysis.totalSourceRows }),
    updateRosterImportRunMatchingRuleVersion(runId, analysis.matchingRuleVersion),
  ]);

  revalidatePath(`/residents/roster-import/${runId}`);
  revalidatePath("/residents/roster-import");

  return {
    success: true,
    totalSourceRows: analysis.totalSourceRows,
    format: analysis.format,
    invalidRowCount: analysis.invalidRows.length,
    unmappedColumns: [...analysis.unmappedColumns],
  };
}

// Combines upload + analyze into one server round trip — the normal-path
// entry point the upload form uses. Avoids an awkward client-side
// "call action A, then call action B" sequencing dance; the run only
// ever reaches the client already fully analyzed (or with an honest
// error), never sitting in a transient 'analyzing' state the client has
// to poll or auto-retrigger. analyzeCommunityRosterImport() itself stays
// separately exported for the genuine failure-recovery case (section
// 106) — a run stuck at 'analyzing' gets a manual retry button, never an
// auto-firing effect.
export interface UploadAndAnalyzeResult extends ActionResult {
  runId?: string;
  alreadyImported?: { runId: string; importedAt: string };
}

export async function uploadAndAnalyzeCommunityRoster(formData: FormData): Promise<UploadAndAnalyzeResult> {
  const uploadResult = await uploadCommunityRoster(formData);
  if (uploadResult.error || uploadResult.alreadyImported || !uploadResult.runId) {
    return uploadResult;
  }

  const analyzeResult = await analyzeCommunityRosterImport(uploadResult.runId);
  if (analyzeResult.error) {
    // The upload itself succeeded and is durably recorded (status stays
    // 'analyzing') — surfaced as a run id so the operator lands on that
    // run's own page and can retry analysis from there, never a dead end
    // requiring a fresh re-upload.
    return { success: true, runId: uploadResult.runId };
  }

  return { success: true, runId: uploadResult.runId };
}

// Pass 4 security fix: this previously accepted a communityId parameter
// (never actually passed by either page, both call it with no argument)
// and, when omitted, fell straight through to
// listCommunityRosterImportRuns(undefined) — which lists EVERY
// community's roster import history with no scoping at all. A
// single-community-scoped operator could see other communities' roster
// import runs (filenames, row counts, importer names) just by visiting
// /residents/roster-import. Resolved from the CALLER's own session scope
// now, exactly like every other community-scoped read in this app
// (resolveCurrentCommunityQueryFilter) — never a caller-supplied
// parameter, never silently "all" by omission.
export async function getCommunityRosterImportHistory() {
  const profile = await getCurrentAuthorizedUser();
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  if (filter.mode === "none") return [];
  return listCommunityRosterImportRuns(filter.mode === "single" ? filter.communityId : undefined);
}

// Pass 4 security fix: previously returned a run's full detail (resident
// names, apartments, phone numbers in each row's raw/normalized payload)
// for ANY runId, with no check that the caller is authorized for that
// run's community — a community-scoped operator could view another
// community's roster data just by knowing or guessing a runId. Returns
// the same {run: null, rows: []} shape the page already treats as
// notFound() for an unauthorized run, rather than a distinct "exists but
// you can't see it" signal that would let an operator enumerate other
// communities' run ids.
export async function getCommunityRosterImportDetail(runId: string) {
  const profile = await getCurrentAuthorizedUser();
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  const run = await getRosterImportRunById(runId);
  if (!run) return { run: null, rows: [] };

  const authorized =
    filter.mode === "all" || (filter.mode === "single" && run.communityId !== null && filter.communityId === run.communityId);
  if (!authorized) return { run: null, rows: [] };

  const rows = await getRosterSourceRowsForRun(runId);
  return { run, rows };
}

// Pass 4 — same community-scoping discipline as the two reads above.
// Not yet wired into any page (data-model reader only, per Part 6's own
// scope decision), but exported as a server action and therefore
// directly callable — scoped defensively regardless of whether a page
// uses it yet.
export async function getUnresolvedCommunityRosterWork() {
  const profile = await getCurrentAuthorizedUser();
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  if (filter.mode === "none") return [];
  return getUnresolvedCommunityRosterSourceRows(filter.mode === "single" ? filter.communityId : undefined);
}

// ─── Pass 2 — review actions: confirm / reject / defer / mark invalid /
// create resident. Every action here requires the same authorized actor
// and community re-check as upload/analyze above, then writes through
// the same governed, source-generic identity RPCs
// lib/actions/reconciliation.ts uses for AxisCare — never a second
// identity mechanism, never an auto-confirm. ─────────────────────────

function revalidateRosterImport(runId: string) {
  revalidatePath(`/residents/roster-import/${runId}`);
  revalidatePath("/residents");
}

// A row's own community is the run's community — re-derived from the
// persisted run, never trusted from the client, mirroring
// requireAuthorizedCommunity's use in upload/analyze above.
async function loadAuthorizedRunAndRow(
  runId: string,
  sourceRowId: string,
  role: AuthRole
): Promise<{ run: NonNullable<Awaited<ReturnType<typeof getRosterImportRunById>>>; row: NonNullable<Awaited<ReturnType<typeof getRosterSourceRowById>>> } | { error: string }> {
  const run = await getRosterImportRunById(runId);
  if (!run || !run.communityId) return { error: "Roster import not found." };
  const communityResult = await requireAuthorizedCommunity(run.communityId, role);
  if ("error" in communityResult) return { error: communityResult.error };

  const row = await getRosterSourceRowById(sourceRowId);
  if (!row || row.importRunId !== runId) return { error: "This roster row could not be found." };
  if (row.reviewState !== "pending" && row.reviewState !== "deferred") {
    return { error: "This roster row was already resolved by someone else. Refresh to see the current state." };
  }

  return { run, row };
}

// Maps a roster row's own reconciliation confidence onto the shared
// vendor-identity vocabulary. "roster_tier" is the roster engine's own
// unit+name match (exact_match/apartment_change) — closest to
// normalized_name_plus_attribute (name plus a corroborating attribute,
// here the apartment). "canonical_signal"/"cross_community"/"manual_search"
// (a possible_match/possible_cross_community_match/ambiguous suggestion,
// or an operator's own free search) is a name-based suggestion still
// pending a human's own judgment either way — name_similarity_pending_review,
// same vocabulary AxisCare's own name-similarity candidates already use.
type RosterMatchBasis = "roster_tier" | "canonical_signal" | "cross_community" | "manual_search";

function toVendorMatch(basis: RosterMatchBasis, rosterConfidence: string | null): {
  method: VendorIdentityMatchMethod;
  confidence: VendorIdentityMatchConfidence;
} {
  if (basis === "roster_tier") {
    return {
      method: "normalized_name_plus_attribute",
      confidence: rosterConfidence === "high" ? "high" : rosterConfidence === "medium" ? "medium" : "low",
    };
  }
  return { method: "name_similarity_pending_review", confidence: "medium" };
}

export interface RosterRowIdentityInput {
  readonly runId: string;
  readonly sourceRowId: string;
  readonly sourceRecordId: string;
  readonly vendorDisplayName: string;
  readonly matchBasis: RosterMatchBasis;
}

// Identity refinement 1 (cross-community overlap/move) — "never erase
// prior community/roster history" is enforced right here, at the one
// place a roster identity link is ever confirmed: if the target resident
// already has a CONFIRMED PRIMARY community_roster link (their own
// community's earlier roster, most commonly), this new link is linked as
// 'concurrent' instead — the DB layer (confirm_person_vendor_identity_link)
// also rejects a second primary outright, so this check exists to give
// an honest, specific rationale rather than a raw constraint-violation
// error. Applies uniformly, not just to cross-community confirmations —
// the same rule protects a resident's first roster link on re-import.
//
// Deliberately 'concurrent', not 'historical' (a Pass 3 semantic
// correction) — a person can legitimately appear on two community
// rosters at once during a move/lease-overlap period, so labeling the
// second link 'historical' would assert a chronological order (this one
// came before / is superseded) this system has no evidence for. See
// supabase/migrations/20260902330000_add_concurrent_vendor_identity_link_role.sql
// and LinkRole's own governing comment (lib/supabase/types.ts).
async function resolveConfirmLinkRole(residentId: string, rationale: string | undefined): Promise<{ linkRole: "primary" | "concurrent"; rationale: string | undefined } | { error: string }> {
  const alreadyHasPrimary = await hasConfirmedPrimaryVendorIdentityLink("resident", residentId, ROSTER_SOURCE_SYSTEM);
  if (!alreadyHasPrimary) return { linkRole: "primary", rationale };

  const concurrentRationale =
    rationale?.trim() ||
    "A confirmed community roster identity already exists for this resident — linked as a second, concurrent source (e.g. a possible cross-community move/lease-overlap) rather than replacing it. No claim is made about which community affiliation is current.";
  return { linkRole: "concurrent", rationale: concurrentRationale };
}

// Confirm — the human decision that this roster row IS a specific,
// already-known Serve resident. Never auto-confirmed by any suggestion
// strength; this action only ever runs from an explicit operator click
// (RosterRowReview.tsx). A confirmed match never creates or changes a
// Serve relationship or Client Readiness eligibility, and never writes
// residents.community_id (identity refinement 1) — the identity link is
// the only thing written here.
export async function confirmCommunityRosterMatch(
  input: RosterRowIdentityInput & { residentId: string },
  rationale?: string
): Promise<ActionResult> {
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const context = await loadAuthorizedRunAndRow(input.runId, input.sourceRowId, actorResult.role);
  if ("error" in context) return context;

  const { method, confidence } = toVendorMatch(input.matchBasis, context.row.matchConfidence);

  const syncResult = await syncExternalPersonIdentity({
    sourceSystem: ROSTER_SOURCE_SYSTEM,
    subjectType: "resident",
    vendorRecordId: input.sourceRecordId,
    vendorDisplayName: input.vendorDisplayName,
    matchMethod: method,
    matchConfidence: confidence,
    candidateSubjectId: input.residentId,
    approvedSourceData: context.row.normalizedPayload,
  });
  if (syncResult.error || !syncResult.linkId) return { error: syncResult.error ?? "Could not prepare this identity link." };

  // skipped_existing_decision: someone already confirmed/rejected/deferred
  // this exact roster observation since this row was analyzed — never
  // silently overwritten; the operator is told to refresh instead.
  if (syncResult.action === "skipped_existing_decision") {
    return { error: "This roster row's identity was already decided by someone else. Refresh to see the current state." };
  }

  const linkRoleResult = await resolveConfirmLinkRole(input.residentId, rationale);
  if ("error" in linkRoleResult) return linkRoleResult;

  const { error: confirmError } = await confirmPersonVendorIdentityLink({
    linkId: syncResult.linkId,
    subjectId: input.residentId,
    actor: actorResult.actor,
    linkRole: linkRoleResult.linkRole,
    rationale: linkRoleResult.rationale,
  });
  if (confirmError) return { error: confirmError };

  const decisionResult = await updateRosterSourceRowDecision(input.sourceRowId, {
    reviewState: "committed",
    matchedResidentId: input.residentId,
    decidedBy: actorResult.actor,
  });
  if (decisionResult.error) return { error: decisionResult.error };

  revalidateRosterImport(input.runId);
  return { success: true };
}

// Reject — this roster row is NOT the suggested candidate. Records the
// rejection at the identity-link layer (so a re-analysis of this same
// run never re-suggests the same candidate — source_record_id is scoped
// to this run, so this never leaks into a later, separate upload) and
// leaves the row itself 'pending' — the operator still needs to either
// search for the correct person or approve it as a new resident.
export async function rejectCommunityRosterMatch(
  input: RosterRowIdentityInput & { residentId: string },
  rationale: string
): Promise<ActionResult> {
  if (!rationale.trim()) return { error: "A rationale is required to record that this is not the same person." };
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const context = await loadAuthorizedRunAndRow(input.runId, input.sourceRowId, actorResult.role);
  if ("error" in context) return context;

  const { method, confidence } = toVendorMatch(input.matchBasis, context.row.matchConfidence);

  const syncResult = await syncExternalPersonIdentity({
    sourceSystem: ROSTER_SOURCE_SYSTEM,
    subjectType: "resident",
    vendorRecordId: input.sourceRecordId,
    vendorDisplayName: input.vendorDisplayName,
    matchMethod: method,
    matchConfidence: confidence,
    candidateSubjectId: input.residentId,
    approvedSourceData: context.row.normalizedPayload,
  });
  if (syncResult.error || !syncResult.linkId) return { error: syncResult.error ?? "Could not prepare this identity link." };
  if (syncResult.action === "skipped_existing_decision") {
    return { error: "This roster row's identity was already decided by someone else. Refresh to see the current state." };
  }

  const { error: rejectError } = await rejectPersonVendorIdentityLink({ linkId: syncResult.linkId, actor: actorResult.actor, rationale });
  if (rejectError) return { error: rejectError };

  revalidateRosterImport(input.runId);
  return { success: true };
}

// Defer — a genuine "not sure yet," resumable later (section 58-61)
// rather than forcing a decision now. When this row has a specific
// suggested candidate (possible_match, or an operator's own search
// pick), that candidate's identity link is deferred too, thin-wrapping
// deferPersonVendorIdentityLink exactly like AxisCare's own
// deferAxisCareResidentIdentity — a genuinely candidate-less row (no
// suggestion at all) defers at the row level only, since there is no
// link to defer.
export async function deferCommunityRosterMatch(
  input: Omit<RosterRowIdentityInput, "matchBasis"> & { matchBasis?: RosterRowIdentityInput["matchBasis"]; residentId?: string },
  rationale: string
): Promise<ActionResult> {
  if (!rationale.trim()) return { error: "A rationale is required to defer this row." };
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const context = await loadAuthorizedRunAndRow(input.runId, input.sourceRowId, actorResult.role);
  if ("error" in context) return context;

  if (input.residentId && input.matchBasis) {
    const { method, confidence } = toVendorMatch(input.matchBasis, context.row.matchConfidence);
    const syncResult = await syncExternalPersonIdentity({
      sourceSystem: ROSTER_SOURCE_SYSTEM,
      subjectType: "resident",
      vendorRecordId: input.sourceRecordId,
      vendorDisplayName: input.vendorDisplayName,
      matchMethod: method,
      matchConfidence: confidence,
      candidateSubjectId: input.residentId,
      approvedSourceData: context.row.normalizedPayload,
    });
    if (syncResult.error || !syncResult.linkId) return { error: syncResult.error ?? "Could not prepare this identity link." };
    if (syncResult.action === "skipped_existing_decision") {
      return { error: "This roster row's identity was already decided by someone else. Refresh to see the current state." };
    }
    const { error: deferError } = await deferPersonVendorIdentityLink({ linkId: syncResult.linkId, actor: actorResult.actor, rationale });
    if (deferError) return { error: deferError };
  }

  const decisionResult = await updateRosterSourceRowDecision(input.sourceRowId, {
    reviewState: "deferred",
    decidedBy: actorResult.actor,
    reviewNotes: rationale,
  });
  if (decisionResult.error) return { error: decisionResult.error };

  revalidateRosterImport(input.runId);
  return { success: true };
}

// Mark Invalid — this row is not a real person (a parsing artifact, a
// vacancy marker the format didn't catch, garbled data) — distinct from
// Defer: a valid row not yet decided, never a status meaning "discard."
export async function markCommunityRosterRowInvalid(
  input: { runId: string; sourceRowId: string },
  reason: string
): Promise<ActionResult> {
  if (!reason.trim()) return { error: "A reason is required to mark this row invalid." };
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const context = await loadAuthorizedRunAndRow(input.runId, input.sourceRowId, actorResult.role);
  if ("error" in context) return context;

  const decisionResult = await updateRosterSourceRowDecision(input.sourceRowId, {
    reviewState: "invalid",
    decidedBy: actorResult.actor,
    reviewNotes: reason,
  });
  if (decisionResult.error) return { error: decisionResult.error };

  revalidateRosterImport(input.runId);
  return { success: true };
}

// Create New Resident — the third resolution path, mirroring
// createResidentFromAxisCareRecord (lib/actions/reconciliation.ts)
// exactly: a fresh canonical duplicate check runs immediately before
// insertion, never trusting this row's own (possibly stale, since-page-load)
// classification. The roster engine's own "new_resident" / the
// orchestration layer's unchanged "new_resident" both mean only "no
// candidate found by either evidence base" — never permission to skip
// this check.
export interface CreateResidentFromRosterRowInput {
  readonly runId: string;
  readonly sourceRowId: string;
  readonly sourceRecordId: string;
  readonly vendorDisplayName: string;
  readonly firstName: string;
  readonly lastName: string;
}

export async function createResidentFromRosterRow(
  input: CreateResidentFromRosterRowInput,
  rationale?: string
): Promise<ActionResult & { residentId?: string; existingMatch?: { residentId: string; residentName: string | null } }> {
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { error: "First and last name are required to create a resident." };
  }

  const context = await loadAuthorizedRunAndRow(input.runId, input.sourceRowId, actorResult.role);
  if ("error" in context) return context;
  const { run } = context;
  if (!run.communityId) return { error: "This import's community could not be determined." };
  const community = await getCommunityById(run.communityId);
  if (!community) return { error: "This import's community could not be determined." };

  // Fresh duplicate check before insertion — never bypassed, never
  // trusting this row's own since-page-load classification (the same
  // discipline createResidentFromAxisCareRecord uses).
  const freshMatch = await findFreshCredibleResidentMatch({
    firstName: input.firstName,
    lastName: input.lastName,
    communityName: community.name,
  });
  if (freshMatch) {
    return {
      error: `${freshMatch.residentName ?? "An existing resident"} in ${community.name} appears to already match this record. Use Match to Existing Person instead.`,
      existingMatch: { residentId: freshMatch.residentId, residentName: freshMatch.residentName },
    };
  }

  const createResult = await createResidentFromExternalSource({
    sourceSystem: ROSTER_SOURCE_SYSTEM,
    sourceRecordId: input.sourceRecordId,
    vendorDisplayName: input.vendorDisplayName,
    firstName: input.firstName,
    lastName: input.lastName,
    communityId: community.id,
    communityName: community.name,
    actor: actorResult.actor,
    rationale: rationale?.trim() || null,
  });
  if (createResult.error || !createResult.residentId) {
    return { error: createResult.error ?? "Could not create a resident from this record." };
  }

  const decisionResult = await updateRosterSourceRowDecision(input.sourceRowId, {
    reviewState: "committed",
    matchedResidentId: createResult.residentId,
    decidedBy: actorResult.actor,
  });
  if (decisionResult.error) return { error: decisionResult.error };

  revalidateRosterImport(input.runId);
  return { success: true, residentId: createResult.residentId };
}

// ─── Pass 3 — Finalize / Cancel / unresolved-work handoff ──────────────
// Match/Create/Reject decisions above are already durable the moment a
// human makes them (Pass 2's real-time governance model) — Finalize is
// NOT a second application of those decisions. It closes out a review
// session: computes the run's final status from whatever review_state
// every row has already reached, records who closed it out, and returns
// a completion summary. Partial finalization (some rows still pending/
// deferred) is explicitly allowed — it never blocks on "everything
// resolved," it just reports honestly what's still open.

async function loadAuthorizedRun(runId: string, role: AuthRole): Promise<{ run: NonNullable<Awaited<ReturnType<typeof getRosterImportRunById>>> } | { error: string }> {
  const run = await getRosterImportRunById(runId);
  if (!run || !run.communityId) return { error: "Roster import not found." };
  const communityResult = await requireAuthorizedCommunity(run.communityId, role);
  if ("error" in communityResult) return { error: communityResult.error };
  return { run };
}

export interface FinalizeCommunityRosterImportResult extends ActionResult {
  status?: import("@/lib/data/residentRoster").RosterImportRunStatus;
  committedCount?: number;
  invalidCount?: number;
  deferredCount?: number;
  pendingCount?: number;
}

export async function finalizeCommunityRosterImport(runId: string): Promise<FinalizeCommunityRosterImportResult> {
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const context = await loadAuthorizedRun(runId, actorResult.role);
  if ("error" in context) return context;
  const { run } = context;

  if (run.status !== "pending_review" && run.status !== "partially_committed") {
    return { error: `This import is ${run.status === "analyzing" ? "still analyzing" : `already ${run.status}`} — there is nothing to finalize.` };
  }

  const rows = await getRosterSourceRowsForRun(runId);
  const counts = { committed: 0, invalid: 0, deferred: 0, pending: 0 };
  for (const row of rows) {
    if (row.reviewState === "committed") counts.committed += 1;
    else if (row.reviewState === "invalid") counts.invalid += 1;
    else if (row.reviewState === "deferred") counts.deferred += 1;
    else counts.pending += 1;
  }

  // Every row reached a terminal, human-made state (committed/invalid) ->
  // fully committed. Anything still pending OR deliberately deferred
  // means real work remains -> partially committed, never blocked.
  const status = counts.pending === 0 && counts.deferred === 0 ? "committed" : "partially_committed";

  const finalizeResult = await finalizeRosterImportRun(runId, { status, finalizedBy: actorResult.actor });
  if (finalizeResult.error) return { error: finalizeResult.error };

  revalidateRosterImport(runId);
  revalidatePath("/residents/roster-import");
  return {
    success: true,
    status,
    committedCount: counts.committed,
    invalidCount: counts.invalid,
    deferredCount: counts.deferred,
    pendingCount: counts.pending,
  };
}

// Cancel — only while nothing canonical was ever touched. Unlike
// Finalize, this is a real discard: the run and its source rows are
// deleted, never soft-cancelled, because there is nothing durable yet to
// preserve as history (a run with even one committed row must be
// Finalized, never cancelled — correcting a bad decision after that
// point goes through the same governed identity-correction actions
// AxisCare Reconciliation already uses, not a roster-specific undo).
export async function cancelCommunityRosterImport(runId: string): Promise<ActionResult> {
  const actorResult = await requireRosterImportActor();
  if ("error" in actorResult) return actorResult;

  const context = await loadAuthorizedRun(runId, actorResult.role);
  if ("error" in context) return context;
  const { run } = context;

  if (run.status !== "analyzing" && run.status !== "pending_review") {
    return { error: `This import is already ${run.status} and can no longer be cancelled — its committed rows are permanent history.` };
  }

  const rows = await getRosterSourceRowsForRun(runId);
  if (rows.some((r) => r.reviewState === "committed")) {
    return { error: "This import already has confirmed matches or created residents — it can no longer be cancelled. Use Finalize Import instead." };
  }

  const deleteResult = await deleteRosterImportRun(runId);
  if (deleteResult.error) return { error: deleteResult.error };

  revalidatePath("/residents/roster-import");
  return { success: true };
}

