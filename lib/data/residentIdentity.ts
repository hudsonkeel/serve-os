// Script-compatible data layer for Resident Identity Resolution —
// relative imports with explicit .ts extensions (matches lib/data/
// relationships.ts / lib/data/residentRoster.ts's convention), so both
// scripts/detectResidentIdentityCandidates.ts and the roster importer can
// import it directly without the Next.js "@/" alias.
import { createServerClient } from "../supabase/server.ts";
import type {
  ConfirmedAlias,
  LiveResidentForIdentity,
  SuppressedPair,
} from "../residents/identity/types.ts";

// communityCode = "all" (Phase E/F completion, section 3) scans across
// every community — the mechanism a genuine cross-community move
// discovery needs. A specific code keeps the original single-community
// scan (still the default in scripts/detectResidentIdentityCandidates.ts)
// — this is additive to that existing behavior, not a replacement of it.
export async function loadResidentsForIdentityDetection(communityCode: string | "all"): Promise<LiveResidentForIdentity[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("residents")
    .select(
      "id, first_name, last_name, middle_name, preferred_name, display_name, full_name, unit_number, building, community_code, community_id, phone, email, date_of_birth, family_contact_name, family_contact_phone, needs_review, is_active, source_system, created_at",
    )
    .eq("is_active", true);
  if (communityCode !== "all") {
    query = query.eq("community_code", communityCode);
  }
  const { data, error } = await query;

  if (error) throw new Error(`Could not load residents for identity detection: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    preferredName: r.preferred_name as string | null,
    displayName: r.display_name as string | null,
    fullName: r.full_name as string | null,
    unitNumber: r.unit_number as string | null,
    building: r.building as string | null,
    communityCode: r.community_code as string | null,
    communityId: r.community_id as string | null,
    phone: r.phone as string | null,
    email: r.email as string | null,
    dateOfBirth: r.date_of_birth as string | null,
    familyContactName: r.family_contact_name as string | null,
    familyContactPhone: r.family_contact_phone as string | null,
    needsReview: r.needs_review as string | null,
    isActive: r.is_active as boolean,
    sourceSystem: r.source_system as string | null,
    createdAt: r.created_at as string,
  }));
}

export async function loadConfirmedAliases(): Promise<ConfirmedAlias[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("resident_identity_aliases").select("canonical_resident_id, normalized_value");
  if (error) throw new Error(`Could not load confirmed aliases: ${error.message}`);
  return (data ?? []).map((a) => ({
    canonicalResidentId: a.canonical_resident_id as string,
    normalizedValue: a.normalized_value as string,
  }));
}

export async function loadSuppressedPairs(): Promise<SuppressedPair[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("resident_identity_suppressions").select("resident_id_a, resident_id_b");
  if (error) throw new Error(`Could not load identity suppressions: ${error.message}`);
  return (data ?? []).map((s) => ({ residentIdA: s.resident_id_a as string, residentIdB: s.resident_id_b as string }));
}

export async function loadAbsentResidentIds(): Promise<Set<string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("roster_absence_reviews").select("resident_id").eq("status", "requires_review");
  if (error) throw new Error(`Could not load absent residents: ${error.message}`);
  return new Set((data ?? []).map((r) => r.resident_id as string));
}

export async function loadRecentlyCreatedResidentIds(withinDays: number): Promise<Set<string>> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("residents").select("id").gte("created_at", since);
  if (error) throw new Error(`Could not load recently created residents: ${error.message}`);
  return new Set((data ?? []).map((r) => r.id as string));
}

export interface ResidentComparisonRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  preferredName: string | null;
  displayName: string | null;
  unitNumber: string | null;
  building: string | null;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  needsReview: string | null;
  sourceSystem: string | null;
  sourceFile: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getResidentsForComparison(residentIds: readonly string[]): Promise<ResidentComparisonRecord[]> {
  if (residentIds.length === 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select(
      "id, first_name, last_name, middle_name, preferred_name, display_name, unit_number, building, phone, email, date_of_birth, needs_review, source_system, source_file, is_active, created_at, updated_at",
    )
    .in("id", residentIds);
  if (error) {
    console.error("[residentIdentity:getResidentsForComparison:error]", { message: error.message });
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    preferredName: r.preferred_name as string | null,
    displayName: r.display_name as string | null,
    unitNumber: r.unit_number as string | null,
    building: r.building as string | null,
    phone: r.phone as string | null,
    email: r.email as string | null,
    dateOfBirth: r.date_of_birth as string | null,
    needsReview: r.needs_review as string | null,
    sourceSystem: r.source_system as string | null,
    sourceFile: r.source_file as string | null,
    isActive: r.is_active as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

// Linked-record counts across the resident-identity dependency inventory
// — lets the comparison UI show "richer history" without the reviewer
// needing to read every note. Counts only (not full rows) — this is a
// summary view, not a data export.
export async function getLinkedRecordCounts(residentId: string): Promise<Record<string, number>> {
  const supabase = createServerClient();
  const tables: readonly [string, string][] = [
    ["resident_interests", "resident_id"],
    ["resident_milestones", "resident_id"],
    ["resident_touches", "resident_id"],
    ["resident_wellness_notes", "resident_id"],
    ["resident_wellness_follow_ups", "resident_id"],
    ["resident_current_needs", "resident_id"],
    ["resident_working_notes", "resident_id"],
    ["resident_timeline", "resident_id"],
    ["relationships", "resident_id"],
    ["resident_apartment_history", "resident_id"],
    ["roster_source_rows", "matched_resident_id"],
  ];

  const counts: Record<string, number> = {};
  await Promise.all(
    tables.map(async ([table, column]) => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(column, residentId);
      counts[table] = error ? 0 : (count ?? 0);
    }),
  );
  return counts;
}

// ─── Redirect / alias lookup (roster importer + general use) ───────────

export async function getRedirectCanonicalId(residentId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_identity_redirects")
    .select("canonical_resident_id")
    .eq("duplicate_resident_id", residentId)
    .maybeSingle();
  if (error) {
    console.error("[residentIdentity:getRedirectCanonicalId:error]", { residentId, message: error.message });
    return null;
  }
  return data ? (data.canonical_resident_id as string) : null;
}

export async function findAliasCanonicalId(normalizedValue: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_identity_aliases")
    .select("canonical_resident_id")
    .eq("normalized_value", normalizedValue)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[residentIdentity:findAliasCanonicalId:error]", { normalizedValue, message: error.message });
    return null;
  }
  return data ? (data.canonical_resident_id as string) : null;
}

// ─── Candidate lifecycle ────────────────────────────────────────────────

export interface CreateCandidatesInput {
  residentIds: readonly string[];
  confidenceBand: string;
  evidence: unknown;
  householdContext?: unknown;
  matchingRuleVersion: string;
}

export async function createIdentityCandidates(
  detectionRunId: string,
  drafts: readonly CreateCandidatesInput[],
  actor: string,
): Promise<{ candidates?: unknown[]; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_resident_identity_candidates", {
    p_detection_run_id: detectionRunId,
    p_candidates: drafts.map((d) => ({
      residentIds: d.residentIds,
      confidenceBand: d.confidenceBand,
      evidence: d.evidence,
      householdContext: d.householdContext ?? [],
      matchingRuleVersion: d.matchingRuleVersion,
    })),
    p_actor: actor,
  });
  if (error) {
    console.error("[residentIdentity:createIdentityCandidates:error]", { message: error.message, code: error.code });
    return { error: "Could not create identity candidates." };
  }
  return { candidates: (data as unknown[]) ?? [] };
}

export async function getIdentityCandidates(filters: { status?: string; confidenceBand?: string } = {}) {
  const supabase = createServerClient();
  let query = supabase.from("resident_identity_candidates").select("*").order("created_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.confidenceBand) query = query.eq("confidence_band", filters.confidenceBand);
  const { data, error } = await query;
  if (error) {
    console.error("[residentIdentity:getIdentityCandidates:error]", { message: error.message });
    return [];
  }
  return data ?? [];
}

export async function getIdentityCandidateById(candidateId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("resident_identity_candidates").select("*").eq("id", candidateId).maybeSingle();
  if (error) {
    console.error("[residentIdentity:getIdentityCandidateById:error]", { candidateId, message: error.message });
    return null;
  }
  return data;
}

export async function getCandidateMemberResidentIds(candidateId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_identity_candidate_members")
    .select("resident_id")
    .eq("candidate_id", candidateId);
  if (error) {
    console.error("[residentIdentity:getCandidateMemberResidentIds:error]", { candidateId, message: error.message });
    return [];
  }
  return (data ?? []).map((r) => r.resident_id as string);
}

export async function resolveCandidateNotDuplicate(candidateId: string, actor: string, reason: string | null): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_resident_identity_candidate_not_duplicate", {
    p_candidate_id: candidateId,
    p_actor: actor,
    p_reason: reason,
  });
  if (error) return { error: "Could not resolve this candidate as not a duplicate." };
  return {};
}

export async function resolveCandidateProfileCorrected(candidateId: string, actor: string, note: string | null): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_resident_identity_candidate_profile_corrected", {
    p_candidate_id: candidateId,
    p_actor: actor,
    p_note: note,
  });
  if (error) return { error: "Could not resolve this candidate as a profile correction." };
  return {};
}

export async function resolveCandidateInvestigate(candidateId: string, actor: string, note: string | null): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_resident_identity_candidate_investigate", {
    p_candidate_id: candidateId,
    p_actor: actor,
    p_note: note,
  });
  if (error) return { error: "Could not mark this candidate for later investigation." };
  return {};
}

export interface UpdateCandidateEvidenceInput {
  candidateId: string;
  confidenceBand: string;
  evidence: unknown;
  householdContext: unknown;
  matchingRuleVersion: string;
}

// Refreshes an OPEN/INVESTIGATING candidate's stored evidence in place —
// used once by `--migrate-phase1` for Phase 1 candidates that turn out to
// have genuine Phase 2 identity evidence once re-derived with the current
// engine (Phase 1 sometimes opened these via a coincidental household
// signal, before signals like compound_name_variant existed). Never
// changes status or resident assignment — purely a content refresh.
export async function updateIdentityCandidateEvidence(input: UpdateCandidateEvidenceInput, actor: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("update_resident_identity_candidate_evidence", {
    p_candidate_id: input.candidateId,
    p_confidence_band: input.confidenceBand,
    p_evidence: input.evidence,
    p_household_context: input.householdContext,
    p_matching_rule_version: input.matchingRuleVersion,
    p_actor: actor,
  });
  if (error) {
    console.error("[residentIdentity:updateIdentityCandidateEvidence:error]", { message: error.message, code: error.code });
    return { error: "Could not refresh this candidate's evidence." };
  }
  return {};
}

export async function dismissIdentityCandidate(candidateId: string, actor: string, reason: string | null): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("dismiss_resident_identity_candidate", {
    p_candidate_id: candidateId,
    p_actor: actor,
    p_reason: reason,
  });
  if (error) return { error: "Could not dismiss this candidate." };
  return {};
}

// ─── Merge / consolidation ───────────────────────────────────────────────

export interface MergeResidentsInput {
  candidateId: string | null;
  canonicalResidentId: string;
  duplicateResidentId: string;
  deferConsolidation: boolean;
  fieldResolutions: Record<string, unknown>;
  actor: string;
  rationale: string | null;
}

export async function mergeResidents(input: MergeResidentsInput): Promise<{ mergeEvent?: Record<string, unknown>; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("merge_residents", {
    p_candidate_id: input.candidateId,
    p_canonical_resident_id: input.canonicalResidentId,
    p_duplicate_resident_id: input.duplicateResidentId,
    p_defer_consolidation: input.deferConsolidation,
    p_field_resolutions: input.fieldResolutions,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });
  if (error) {
    console.error("[residentIdentity:mergeResidents:error]", { message: error.message, code: error.code });
    return { error: "Could not merge these residents." };
  }
  return { mergeEvent: data as Record<string, unknown> };
}

export async function completeResidentConsolidation(mergeEventId: string, actor: string): Promise<{ mergeEvent?: Record<string, unknown>; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("complete_resident_consolidation", {
    p_merge_event_id: mergeEventId,
    p_actor: actor,
  });
  if (error) {
    console.error("[residentIdentity:completeResidentConsolidation:error]", { message: error.message, code: error.code });
    return { error: "Could not complete consolidation." };
  }
  return { mergeEvent: data as Record<string, unknown> };
}

// ─── Household links — standalone, non-identity infrastructure ──────────

export interface CreateHouseholdLinkInput {
  residentIds: readonly [string, string];
  relationshipHint: string;
  evidence: unknown;
  matchingRuleVersion: string;
}

export async function createHouseholdLinks(
  detectionRunId: string,
  links: readonly CreateHouseholdLinkInput[],
  actor: string,
): Promise<{ links?: unknown[]; error?: string }> {
  if (links.length === 0) return { links: [] };
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_resident_household_links", {
    p_detection_run_id: detectionRunId,
    p_links: links.map((l) => ({
      residentIds: l.residentIds,
      relationshipHint: l.relationshipHint,
      evidence: l.evidence,
      matchingRuleVersion: l.matchingRuleVersion,
    })),
    p_actor: actor,
  });
  if (error) {
    console.error("[residentIdentity:createHouseholdLinks:error]", { message: error.message, code: error.code });
    return { error: "Could not create household links." };
  }
  return { links: (data as unknown[]) ?? [] };
}

export async function getHouseholdLinksCount(): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase.from("resident_household_links").select("*", { count: "exact", head: true });
  if (error) {
    console.error("[residentIdentity:getHouseholdLinksCount:error]", { message: error.message });
    return 0;
  }
  return count ?? 0;
}

// ─── Phase 1 -> Phase 2 one-time migration support ───────────────────────

export interface OpenCandidateForMigration {
  id: string;
  status: string;
  evidence: { signalType: string }[];
  memberResidentIds: string[];
}

// Every currently open/investigating candidate, with its member resident
// ids — used once by `scripts/detectResidentIdentityCandidates.ts
// --migrate-phase1` to find the Phase 1 candidates whose evidence is
// entirely household-domain (no real identity signal) and reclassify them.
export async function loadOpenCandidatesForMigration(): Promise<OpenCandidateForMigration[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_identity_candidates")
    .select("id, status, evidence, resident_identity_candidate_members(resident_id)")
    .in("status", ["open", "investigating"]);
  if (error) throw new Error(`Could not load open candidates for migration: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    status: c.status as string,
    evidence: (c.evidence as { signalType: string }[]) ?? [],
    memberResidentIds: ((c.resident_identity_candidate_members as { resident_id: string }[]) ?? []).map((m) => m.resident_id),
  }));
}

// Used by the resident detail page to decide whether a relationship
// conflict is explained by a known duplicate-resident candidate (in which
// case the page should point at THIS review flow, not the generic
// relationship-correction control — see ResidentIdentityAndRelationship.tsx).
// Read-only; never creates or resolves anything.
export async function getOpenDuplicateCandidateForResident(
  residentId: string,
): Promise<{ id: string; confidenceBand: string } | null> {
  const supabase = createServerClient();
  const { data: memberRows, error: memberError } = await supabase
    .from("resident_identity_candidate_members")
    .select("candidate_id")
    .eq("resident_id", residentId);
  if (memberError) {
    console.error("[residentIdentity:getOpenDuplicateCandidateForResident:members-error]", { residentId, message: memberError.message });
    return null;
  }
  const candidateIds = (memberRows ?? []).map((r) => r.candidate_id as string);
  if (candidateIds.length === 0) return null;

  const { data: candidateRows, error: candidateError } = await supabase
    .from("resident_identity_candidates")
    .select("id, confidence_band, created_at")
    .in("id", candidateIds)
    .in("status", ["open", "investigating"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (candidateError) {
    console.error("[residentIdentity:getOpenDuplicateCandidateForResident:candidates-error]", { residentId, message: candidateError.message });
    return null;
  }
  const candidate = candidateRows?.[0];
  return candidate ? { id: candidate.id as string, confidenceBand: candidate.confidence_band as string } : null;
}

export async function getMergeEventByDuplicateResidentId(duplicateResidentId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_identity_redirects")
    .select("merge_event_id, resident_merge_events(*)")
    .eq("duplicate_resident_id", duplicateResidentId)
    .maybeSingle();
  if (error) {
    console.error("[residentIdentity:getMergeEventByDuplicateResidentId:error]", { duplicateResidentId, message: error.message });
    return null;
  }
  return data;
}
