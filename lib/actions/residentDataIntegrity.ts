"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  correctMalformedField as correctMalformedFieldRecord,
  dismissIssueNotAnIssue as dismissIssueNotAnIssueRecord,
  loadResidentsForIdentityReevaluation,
  markIssueInvestigating as markIssueInvestigatingRecord,
  resolveIssueMerged as resolveIssueMergedRecord,
  returnIssueToIdentityReview as returnIssueToIdentityReviewRecord,
} from "@/lib/data/residentDataIntegrity";
import { mergeResidents as mergeResidentsRecord } from "@/lib/data/residentIdentity";
import { assignConfidenceBand } from "@/lib/residents/identity/confidenceBands";
import { generateHouseholdSignals } from "@/lib/residents/identity/householdSignals";
import { generateIdentitySignals } from "@/lib/residents/identity/identitySignals";
import { MATCHING_RULE_VERSION } from "@/lib/residents/identity/candidateDetection";

async function currentActorLabel(): Promise<string | null> {
  const profile = await getCurrentAuthorizedUser();
  return profile?.full_name || profile?.email || null;
}

// "Confirm Duplicate Import Record" — reuses the EXISTING merge/
// consolidation infrastructure (mergeResidents, the same entry point
// /resident-identities uses) rather than a second merge path. This action
// never merges anything itself; it delegates the merge, then links the
// resulting merge event to the issue and closes it.
export async function confirmDuplicateImportRecord(data: {
  issueId: string;
  canonicalResidentId: string;
  duplicateResidentId: string;
  deferConsolidation: boolean;
  fieldResolutions?: Record<string, unknown>;
  rationale?: string;
}): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to confirm a duplicate import record." };
  }
  if (!data.canonicalResidentId || !data.duplicateResidentId) {
    return { error: "Select both a canonical and a duplicate resident." };
  }
  if (data.canonicalResidentId === data.duplicateResidentId) {
    return { error: "Canonical and duplicate residents must be different." };
  }

  const rationale = data.rationale?.trim() || null;

  const mergeResult = await mergeResidentsRecord({
    candidateId: null,
    canonicalResidentId: data.canonicalResidentId,
    duplicateResidentId: data.duplicateResidentId,
    deferConsolidation: data.deferConsolidation,
    fieldResolutions: data.fieldResolutions ?? {},
    actor,
    rationale,
  });
  if (mergeResult.error || !mergeResult.mergeEvent) {
    return { error: mergeResult.error ?? "Could not merge these residents." };
  }

  const linkResult = await resolveIssueMergedRecord(data.issueId, mergeResult.mergeEvent.id as string, actor, rationale);
  return linkResult.error ? { error: linkResult.error } : {};
}

export async function correctIntegrityIssueMalformedField(data: {
  issueId: string;
  residentId: string;
  field: "phone" | "first_name" | "last_name" | "middle_name";
  newValue: string;
}): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to correct a field." };
  }
  if (!data.newValue?.trim()) {
    return { error: "A corrected value is required." };
  }
  const result = await correctMalformedFieldRecord(
    { issueId: data.issueId, residentId: data.residentId, field: data.field, newValue: data.newValue.trim() },
    actor,
  );
  return result.error ? { error: result.error } : {};
}

// "Return to Identity Review" — the reviewer is asserting this issue is
// actually a "same human?" question, not a data-handling defect. Evidence
// is re-derived fresh with the SAME identity engine used everywhere else
// (never trusted from the integrity issue's own evidence blob, which was
// computed by a different detector answering a different question).
export async function returnIntegrityIssueToIdentityReview(data: {
  issueId: string;
  residentIds: [string, string];
  note?: string;
}): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to return an issue to identity review." };
  }

  const residents = await loadResidentsForIdentityReevaluation(data.residentIds);
  const [a, b] = residents;
  if (!a || !b) {
    return { error: "Could not load both residents for this issue." };
  }

  const emptyContext = { confirmedAliases: [], absentResidentIds: new Set<string>(), recentlyCreatedResidentIds: new Set<string>() };
  const identityEvidence = generateIdentitySignals(a, b, emptyContext);
  const householdEvidence = generateHouseholdSignals(a, b);
  const confidenceBand = assignConfidenceBand(identityEvidence, householdEvidence) ?? "needs_investigation";

  const result = await returnIssueToIdentityReviewRecord(
    {
      issueId: data.issueId,
      confidenceBand,
      evidence: identityEvidence,
      householdContext: householdEvidence,
      matchingRuleVersion: MATCHING_RULE_VERSION,
      note: data.note?.trim() || null,
    },
    actor,
  );
  return result.error ? { error: result.error } : {};
}

export async function dismissIntegrityIssueNotAnIssue(data: { issueId: string; reason?: string }): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to dismiss an issue." };
  }
  const result = await dismissIssueNotAnIssueRecord(data.issueId, actor, data.reason?.trim() || null);
  return result.error ? { error: result.error } : {};
}

export async function markIntegrityIssueInvestigating(data: { issueId: string; note?: string }): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to update an issue." };
  }
  const result = await markIssueInvestigatingRecord(data.issueId, actor, data.note?.trim() || null);
  return result.error ? { error: result.error } : {};
}
