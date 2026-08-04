"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  completeResidentConsolidation as completeResidentConsolidationRecord,
  dismissIdentityCandidate as dismissIdentityCandidateRecord,
  mergeResidents as mergeResidentsRecord,
  resolveCandidateInvestigate as resolveCandidateInvestigateRecord,
  resolveCandidateNotDuplicate as resolveCandidateNotDuplicateRecord,
  resolveCandidateProfileCorrected as resolveCandidateProfileCorrectedRecord,
} from "@/lib/data/residentIdentity";

async function currentActorLabel(): Promise<string | null> {
  const profile = await getCurrentAuthorizedUser();
  return profile?.full_name || profile?.email || null;
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
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to merge residents." };
  }
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
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to complete consolidation." };
  }
  const result = await completeResidentConsolidationRecord(data.mergeEventId, actor);
  return result.error ? { error: result.error } : {};
}

export async function resolveIdentityCandidateNotDuplicate(data: { candidateId: string; reason?: string }): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to resolve a candidate." };
  }
  const result = await resolveCandidateNotDuplicateRecord(data.candidateId, actor, data.reason?.trim() || null);
  return result.error ? { error: result.error } : {};
}

export async function resolveIdentityCandidateProfileCorrected(data: { candidateId: string; note?: string }): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to resolve a candidate." };
  }
  const result = await resolveCandidateProfileCorrectedRecord(data.candidateId, actor, data.note?.trim() || null);
  return result.error ? { error: result.error } : {};
}

export async function resolveIdentityCandidateInvestigate(data: { candidateId: string; note?: string }): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to update a candidate." };
  }
  const result = await resolveCandidateInvestigateRecord(data.candidateId, actor, data.note?.trim() || null);
  return result.error ? { error: result.error } : {};
}

export async function dismissIdentityCandidate(data: { candidateId: string; reason?: string }): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to dismiss a candidate." };
  }
  const result = await dismissIdentityCandidateRecord(data.candidateId, actor, data.reason?.trim() || null);
  return result.error ? { error: result.error } : {};
}
