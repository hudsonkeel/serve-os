import type { ResidentMatchCandidate, ResidentMatchResult } from "./types.ts";

// Pure, deterministic Resident matching — see docs/design/
// SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Resident matching." Never fuzzy:
// every rule below is an exact, normalized-string comparison. The caller
// (lib/data/intake.ts) is responsible for fetching `candidates` — a
// pre-filtered, deterministic search result (e.g. by community + name),
// never a fuzzy database query — so this function only ever has to decide
// among a small, already-relevant candidate set.

export interface ResidentMatchInput {
  externalSourceKey?: string | null;
  residentId?: string | null;
  fullName: string | null;
  unitNumber?: string | null;
  communityName?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function candidateFullName(candidate: ResidentMatchCandidate): string {
  return normalize([candidate.firstName, candidate.lastName].filter(Boolean).join(" "));
}

// Matching hierarchy (Part 6): exact identifier > exact resident ID >
// name+unit > name+community > unique name alone > Needs Review. Never
// auto-creates a Resident on failure — that decision belongs to the
// classification layer / staff review, not this function.
export function matchResident(
  input: ResidentMatchInput,
  candidates: readonly ResidentMatchCandidate[]
): ResidentMatchResult {
  if (input.externalSourceKey) {
    const exact = candidates.find(
      (c) => normalize(c.externalSourceKey) === normalize(input.externalSourceKey)
    );
    if (exact) return { residentId: exact.id, reasonCode: "RESIDENT_EXACT_MATCH" };
  }

  if (input.residentId) {
    const exact = candidates.find((c) => c.id === input.residentId);
    if (exact) return { residentId: exact.id, reasonCode: "RESIDENT_EXACT_MATCH" };
  }

  const normalizedName = normalize(input.fullName);
  if (!normalizedName) {
    return { residentId: null, reasonCode: "INSUFFICIENT_RESIDENT_IDENTITY" };
  }

  const nameMatches = candidates.filter((c) => candidateFullName(c) === normalizedName);

  if (input.unitNumber) {
    const withUnit = nameMatches.filter((c) => normalize(c.unitNumber) === normalize(input.unitNumber));
    if (withUnit.length === 1) return { residentId: withUnit[0].id, reasonCode: "RESIDENT_NAME_UNIT_MATCH" };
    if (withUnit.length > 1) return { residentId: null, reasonCode: "MULTIPLE_RESIDENT_MATCHES" };
  }

  if (input.communityName) {
    const withCommunity = nameMatches.filter(
      (c) => normalize(c.communityName) === normalize(input.communityName)
    );
    if (withCommunity.length === 1) return { residentId: withCommunity[0].id, reasonCode: "RESIDENT_NAME_UNIT_MATCH" };
    if (withCommunity.length > 1) return { residentId: null, reasonCode: "MULTIPLE_RESIDENT_MATCHES" };
  }

  if (nameMatches.length === 1) {
    return { residentId: nameMatches[0].id, reasonCode: "RESIDENT_NAME_UNIT_MATCH" };
  }
  if (nameMatches.length > 1) {
    return { residentId: null, reasonCode: "MULTIPLE_RESIDENT_MATCHES" };
  }

  return { residentId: null, reasonCode: "RESIDENT_MATCH_REQUIRED" };
}
