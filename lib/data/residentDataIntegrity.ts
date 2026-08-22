// Script-compatible data layer for Resident Data Integrity — relative
// imports with explicit .ts extensions (matches lib/data/residentIdentity.ts's
// convention), so both scripts/detectResidentDataIntegrityIssues.ts and
// scripts/importWatermereRoster.ts can import it directly without the
// Next.js "@/" alias.
import { createServerClient } from "../supabase/server.ts";
import type { IssueDraft, ResidentForIntegrityDetection } from "../residents/dataIntegrity/types.ts";
import type { LiveResidentForIdentity } from "../residents/identity/types.ts";

export async function loadResidentsForIntegrityDetection(communityCode: string): Promise<ResidentForIntegrityDetection[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, middle_name, unit_number, phone, phone_raw, source_system, source_file, import_batch, created_at, is_active")
    .eq("community_code", communityCode)
    .eq("is_active", true);

  if (error) throw new Error(`Could not load residents for data integrity detection: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    unitNumber: r.unit_number as string | null,
    phone: r.phone as string | null,
    phoneRaw: r.phone_raw as string | null,
    sourceSystem: r.source_system as string | null,
    sourceFile: r.source_file as string | null,
    importBatch: r.import_batch as string | null,
    createdAt: r.created_at as string,
    isActive: r.is_active as boolean,
  }));
}

// Fetches a specific set of residents in the LiveResidentForIdentity shape
// — used by the "Return to Identity Review" action, which re-evaluates a
// single (reviewer-selected) pair with the SAME identity engine used
// everywhere else (lib/residents/identity/), rather than a bespoke
// evaluation. Community-wide detection context (confirmed aliases, absence/
// recency) is intentionally omitted here — this is a single-pair,
// human-triggered re-check, not a bulk detection run.
export async function loadResidentsForIdentityReevaluation(residentIds: readonly string[]): Promise<LiveResidentForIdentity[]> {
  if (residentIds.length === 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select(
      "id, first_name, last_name, middle_name, preferred_name, display_name, full_name, unit_number, building, community_code, community_id, phone, email, date_of_birth, family_contact_name, family_contact_phone, needs_review, is_active, source_system, created_at",
    )
    .in("id", residentIds);
  if (error) {
    console.error("[residentDataIntegrity:loadResidentsForIdentityReevaluation:error]", { message: error.message });
    return [];
  }
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

// Used by --migrate-existing-cases: fetches a specific set of residents
// (an existing identity candidate's members) in the same shape as
// loadResidentsForIntegrityDetection, so the exact same
// detectSameImportDuplicate rule can be re-run against them.
export async function loadResidentsForIntegrityDetectionByIds(residentIds: readonly string[]): Promise<ResidentForIntegrityDetection[]> {
  if (residentIds.length === 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, middle_name, unit_number, phone, phone_raw, source_system, source_file, import_batch, created_at, is_active")
    .in("id", residentIds);
  if (error) {
    console.error("[residentDataIntegrity:loadResidentsForIntegrityDetectionByIds:error]", { message: error.message });
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    unitNumber: r.unit_number as string | null,
    phone: r.phone as string | null,
    phoneRaw: r.phone_raw as string | null,
    sourceSystem: r.source_system as string | null,
    sourceFile: r.source_file as string | null,
    importBatch: r.import_batch as string | null,
    createdAt: r.created_at as string,
    isActive: r.is_active as boolean,
  }));
}

export async function createIntegrityIssues(
  detectionRunId: string,
  drafts: readonly IssueDraft[],
  actor: string,
): Promise<{ issues?: unknown[]; error?: string }> {
  if (drafts.length === 0) return { issues: [] };
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_resident_data_integrity_issues", {
    p_detection_run_id: detectionRunId,
    p_issues: drafts.map((d) => ({
      issueType: d.issueType,
      severity: d.severity,
      sourceSystem: d.sourceSystem,
      sourceFile: d.sourceFile,
      importBatch: d.importBatch,
      importRunId: d.importRunId,
      evidence: d.evidence,
      recommendedAction: d.recommendedAction,
      detectorRule: d.detectorRule,
      detectorVersion: d.detectorVersion,
      fingerprint: d.fingerprint,
      members: d.members,
    })),
    p_actor: actor,
  });
  if (error) {
    console.error("[residentDataIntegrity:createIntegrityIssues:error]", { message: error.message, code: error.code });
    return { error: "Could not create data integrity issues." };
  }
  return { issues: (data as unknown[]) ?? [] };
}

// Feeds lib/residents/dataIntegrity/precedence.ts's buildIntegrityClaimedPairs
// — consulted by scripts/detectResidentIdentityCandidates.ts so a pair
// already claimed by an open same_import_duplicate issue is never ALSO
// proposed as an identity or household candidate (detection precedence
// step 2).
export async function loadOpenSameImportDuplicatePairs(): Promise<[string, string][]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_data_integrity_issues")
    .select("id, resident_data_integrity_issue_members(resident_id)")
    .eq("issue_type", "same_import_duplicate")
    .in("status", ["open", "investigating"]);
  if (error) {
    console.error("[residentDataIntegrity:loadOpenSameImportDuplicatePairs:error]", { message: error.message });
    return [];
  }
  const pairs: [string, string][] = [];
  for (const issue of data ?? []) {
    const memberIds = ((issue.resident_data_integrity_issue_members as { resident_id: string }[]) ?? []).map((m) => m.resident_id);
    if (memberIds.length === 2) pairs.push([memberIds[0], memberIds[1]]);
  }
  return pairs;
}

export async function getIntegrityIssues(filters: { status?: string; issueType?: string; severity?: string } = {}) {
  const supabase = createServerClient();
  let query = supabase.from("resident_data_integrity_issues").select("*").order("created_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.issueType) query = query.eq("issue_type", filters.issueType);
  if (filters.severity) query = query.eq("severity", filters.severity);
  const { data, error } = await query;
  if (error) {
    console.error("[residentDataIntegrity:getIntegrityIssues:error]", { message: error.message });
    return [];
  }
  return data ?? [];
}

export async function getIntegrityIssueById(issueId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("resident_data_integrity_issues").select("*").eq("id", issueId).maybeSingle();
  if (error) {
    console.error("[residentDataIntegrity:getIntegrityIssueById:error]", { issueId, message: error.message });
    return null;
  }
  return data;
}

export async function getIssueMemberResidentIds(issueId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("resident_data_integrity_issue_members").select("resident_id").eq("issue_id", issueId);
  if (error) {
    console.error("[residentDataIntegrity:getIssueMemberResidentIds:error]", { issueId, message: error.message });
    return [];
  }
  return (data ?? []).map((r) => r.resident_id as string);
}

export async function markIssueInvestigating(issueId: string, actor: string, note: string | null): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("mark_resident_data_integrity_issue_investigating", {
    p_issue_id: issueId,
    p_actor: actor,
    p_note: note,
  });
  if (error) return { error: "Could not mark this issue for later investigation." };
  return {};
}

export async function dismissIssueNotAnIssue(issueId: string, actor: string, reason: string | null): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("dismiss_resident_data_integrity_issue_not_an_issue", {
    p_issue_id: issueId,
    p_actor: actor,
    p_reason: reason,
  });
  if (error) return { error: "Could not dismiss this issue." };
  return {};
}

// Called AFTER the caller has already invoked the existing mergeResidents()
// (see lib/data/residentIdentity.ts) — this only links the resulting merge
// event and closes the issue. Never merges anything itself.
export async function resolveIssueMerged(issueId: string, mergeEventId: string, actor: string, rationale: string | null): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_resident_data_integrity_issue_merged", {
    p_issue_id: issueId,
    p_merge_event_id: mergeEventId,
    p_actor: actor,
    p_rationale: rationale,
  });
  if (error) return { error: "Could not resolve this issue as a confirmed duplicate." };
  return {};
}

export interface CorrectMalformedFieldInput {
  issueId: string;
  residentId: string;
  field: "phone" | "first_name" | "last_name" | "middle_name";
  newValue: string;
}

export async function correctMalformedField(input: CorrectMalformedFieldInput, actor: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("correct_resident_data_integrity_malformed_field", {
    p_issue_id: input.issueId,
    p_resident_id: input.residentId,
    p_field: input.field,
    p_new_value: input.newValue,
    p_actor: actor,
  });
  if (error) return { error: "Could not correct this field." };
  return {};
}

export interface ReturnToIdentityReviewInput {
  issueId: string;
  confidenceBand: string;
  evidence: unknown;
  householdContext: unknown;
  matchingRuleVersion: string;
  note: string | null;
}

export async function returnIssueToIdentityReview(input: ReturnToIdentityReviewInput, actor: string): Promise<{ candidate?: unknown; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("return_resident_data_integrity_issue_to_identity_review", {
    p_issue_id: input.issueId,
    p_confidence_band: input.confidenceBand,
    p_evidence: input.evidence,
    p_household_context: input.householdContext,
    p_matching_rule_version: input.matchingRuleVersion,
    p_actor: actor,
    p_note: input.note,
  });
  if (error) {
    console.error("[residentDataIntegrity:returnIssueToIdentityReview:error]", { message: error.message, code: error.code });
    return { error: "Could not return this issue to identity review." };
  }
  return { candidate: data as unknown };
}
