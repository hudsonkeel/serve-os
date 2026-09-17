"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { resolveReconciliationActor } from "@/lib/auth/reconciliationActor";
import {
  completeResidentConsolidation as completeResidentConsolidationRecord,
  dismissIdentityCandidate as dismissIdentityCandidateRecord,
  mergeResidents as mergeResidentsRecord,
  resolveCandidateInvestigate as resolveCandidateInvestigateRecord,
  resolveCandidateNotDuplicate as resolveCandidateNotDuplicateRecord,
  resolveCandidateProfileCorrected as resolveCandidateProfileCorrectedRecord,
} from "@/lib/data/residentIdentity";

// Security hotfix (fix/resident-identity-authorization) — every export in
// this file used to accept any signed-in user, regardless of role.
// mergeResidents in particular merges two canonical resident records, a
// hard-to-reverse identity mutation; the others correct resident PII
// fields or resolve/dismiss identity findings. All now require
// canPerformReconciliationActions (admin/manager/executive), via the
// shared resolveReconciliationActor() (lib/auth/reconciliationActor.ts) —
// the exact boundary lib/actions/reconciliation.ts already enforces for
// the sibling /reconciliation workflow, reused here rather than a second
// predicate so the two authorization tiers can never drift apart. This is
// the real authorization boundary; the page-level checks in
// app/resident-identities/**/page.tsx are the first line, not the only
// one.
async function requireReconciliationActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  return resolveReconciliationActor(profile);
}

// Confirming "same person" — always immediate alias + redirect +
// deactivation; p_defer_consolidation controls only whether the heavier
// table-by-table reassignment runs now ("Alias only" / "Full merge") or
// later ("Same human, consolidation deferred"). See
// supabase/migrations/20260805000000_create_resident_identity_resolution.sql's
// module comment for why a candidate can never resolve to two
// independently active ordinary residents.
export async function mergeResidents(data: {
  candidateId: string | null;
  canonicalResidentId: string;
  duplicateResidentId: string;
  deferConsolidation: boolean;
  fieldResolutions?: Record<string, unknown>;
  rationale?: string;
}): Promise<{ error?: string }> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;
  const { actor } = actorResult;

  if (!data.canonicalResidentId || !data.duplicateResidentId) {
    return { error: "Select both a canonical and a duplicate resident." };
  }
  if (data.canonicalResidentId === data.duplicateResidentId) {
    return { error: "Canonical and duplicate residents must be different." };
  }

  const result = await mergeResidentsRecord({
    candidateId: data.candidateId,
    canonicalResidentId: data.canonicalResidentId,
    duplicateResidentId: data.duplicateResidentId,
    deferConsolidation: data.deferConsolidation,
    fieldResolutions: data.fieldResolutions ?? {},
    actor,
    rationale: data.rationale?.trim() || null,
  });

  return result.error ? { error: result.error } : {};
}

export async function completeResidentConsolidation(data: { mergeEventId: string }): Promise<{ error?: string }> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const result = await completeResidentConsolidationRecord(data.mergeEventId, actorResult.actor);
  return result.error ? { error: result.error } : {};
}

export async function resolveIdentityCandidateNotDuplicate(data: { candidateId: string; reason?: string }): Promise<{ error?: string }> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const result = await resolveCandidateNotDuplicateRecord(data.candidateId, actorResult.actor, data.reason?.trim() || null);
  return result.error ? { error: result.error } : {};
}

export async function resolveIdentityCandidateProfileCorrected(data: { candidateId: string; note?: string }): Promise<{ error?: string }> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const result = await resolveCandidateProfileCorrectedRecord(data.candidateId, actorResult.actor, data.note?.trim() || null);
  return result.error ? { error: result.error } : {};
}

export async function resolveIdentityCandidateInvestigate(data: { candidateId: string; note?: string }): Promise<{ error?: string }> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const result = await resolveCandidateInvestigateRecord(data.candidateId, actorResult.actor, data.note?.trim() || null);
  return result.error ? { error: result.error } : {};
}

export async function dismissIdentityCandidate(data: { candidateId: string; reason?: string }): Promise<{ error?: string }> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const result = await dismissIdentityCandidateRecord(data.candidateId, actorResult.actor, data.reason?.trim() || null);
  return result.error ? { error: result.error } : {};
}
