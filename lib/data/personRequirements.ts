// Data layer for the platform-owned Requirement / Requirement Set reference
// data. See supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql.
// Reference data — read-mostly; no write path is needed by this phase
// (requirements/sets are seeded by migration, not created at runtime).
import { createServerClient } from "../supabase/server.ts";
import type { PersonRequirement, RequirementSet, RequirementSetMember } from "../supabase/types.ts";

export async function getRequirementSetByCode(setCode: string): Promise<RequirementSet | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("requirement_sets")
    .select("*")
    .eq("set_code", setCode)
    .maybeSingle();

  if (error) {
    console.error("[getRequirementSetByCode]", { setCode, message: error.message });
    return null;
  }

  return (data as RequirementSet | null) ?? null;
}

export async function listRequirementSets(): Promise<RequirementSet[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("requirement_sets").select("*").order("name", { ascending: true });

  if (error) {
    console.error("[listRequirementSets]", { message: error.message });
    return [];
  }

  return (data as RequirementSet[] | null) ?? [];
}

export interface RequirementSetWithRequirements {
  set: RequirementSet;
  requirements: PersonRequirement[];
}

// Resolves a Requirement Set's full membership in one call — the shape
// lib/compliance/requirementSetStatus.ts actually needs.
export async function getRequirementSetWithRequirements(
  setCode: string
): Promise<RequirementSetWithRequirements | null> {
  const supabase = createServerClient();

  const set = await getRequirementSetByCode(setCode);
  if (!set) return null;

  const { data: members, error: membersError } = await supabase
    .from("requirement_set_members")
    .select("*")
    .eq("requirement_set_id", set.id)
    .order("sort_order", { ascending: true });

  if (membersError) {
    console.error("[getRequirementSetWithRequirements]", { setCode, message: membersError.message });
    return { set, requirements: [] };
  }

  const memberRows = (members as RequirementSetMember[] | null) ?? [];
  if (memberRows.length === 0) return { set, requirements: [] };

  const { data: requirements, error: requirementsError } = await supabase
    .from("person_requirements")
    .select("*")
    .in(
      "id",
      memberRows.map((m) => m.requirement_id)
    );

  if (requirementsError) {
    console.error("[getRequirementSetWithRequirements]", { setCode, message: requirementsError.message });
    return { set, requirements: [] };
  }

  const requirementRows = (requirements as PersonRequirement[] | null) ?? [];
  // Preserve the set's own sort_order rather than whatever order the `in`
  // query happened to return.
  const byId = new Map(requirementRows.map((r) => [r.id, r]));
  const ordered = memberRows
    .map((m) => byId.get(m.requirement_id))
    .filter((r): r is PersonRequirement => Boolean(r));

  return { set, requirements: ordered };
}

export async function getRequirementById(id: string): Promise<PersonRequirement | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("person_requirements").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getRequirementById]", { id, message: error.message });
    return null;
  }

  return (data as PersonRequirement | null) ?? null;
}

// Bulk id -> requirement_code lookup, for callers (Today's Work's
// corrective-action composition) resolving many compliance_corrective_actions
// rows' requirement_id at once — one query, never one per row.
export async function getRequirementsByIds(ids: readonly string[]): Promise<Map<string, PersonRequirement>> {
  const result = new Map<string, PersonRequirement>();
  if (ids.length === 0) return result;

  const supabase = createServerClient();
  const { data, error } = await supabase.from("person_requirements").select("*").in("id", ids as string[]);

  if (error) {
    console.error("[getRequirementsByIds]", { message: error.message });
    return result;
  }

  for (const row of (data as PersonRequirement[] | null) ?? []) {
    result.set(row.id, row);
  }
  return result;
}

export async function getRequirementByCode(requirementCode: string): Promise<PersonRequirement | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_requirements")
    .select("*")
    .eq("requirement_code", requirementCode)
    .maybeSingle();

  if (error) {
    console.error("[getRequirementByCode]", { requirementCode, message: error.message });
    return null;
  }

  return (data as PersonRequirement | null) ?? null;
}

// ─── Audit Readiness — requirement versioning ─────────────────────────────
// "Treat requirement versions as immutable once relied upon in a completed
// audit" — this is the enforcement point. A requirement that has already
// been evaluated in at least one audit_session_items row belonging to a
// completed audit_sessions row can never be hand-edited in place; the only
// path forward is supersedePersonRequirement() below, which creates a new
// version and retires this one. Requirements never yet relied upon in a
// completed audit (the common case — most edits happen during drafting,
// before any audit has run) remain freely editable.
export async function hasRequirementBeenReliedUponInCompletedAudit(requirementId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("audit_session_items")
    .select("id, audit_sessions!inner(status)")
    .eq("requirement_id", requirementId)
    .eq("audit_sessions.status", "completed")
    .limit(1);

  if (error) {
    console.error("[hasRequirementBeenReliedUponInCompletedAudit]", { requirementId, message: error.message });
    return true; // fail closed — never claim "safe to edit" on an error
  }
  return (data?.length ?? 0) > 0;
}

// Ordinary field edits (name/description/category/severity-adjacent
// fields) — refuses once the requirement has been relied upon in a
// completed audit, per the guarantee above. Callers should catch the
// `locked: true` result and offer supersedePersonRequirement() instead.
export async function updatePersonRequirement(input: {
  requirementId: string;
  name?: string;
  description?: string | null;
  category?: string;
  regulatoryAuthority?: string | null;
  requiresDocument?: boolean;
  requiresVerification?: boolean;
  requiredScore?: number | null;
}): Promise<{ requirement?: PersonRequirement; error?: string; locked?: boolean }> {
  const locked = await hasRequirementBeenReliedUponInCompletedAudit(input.requirementId);
  if (locked) {
    return {
      locked: true,
      error:
        "This requirement version has already been relied upon in a completed audit and cannot be edited in place. Use supersedePersonRequirement() to create a new version instead.",
    };
  }

  const supabase = createServerClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.regulatoryAuthority !== undefined) patch.regulatory_authority = input.regulatoryAuthority;
  if (input.requiresDocument !== undefined) patch.requires_document = input.requiresDocument;
  if (input.requiresVerification !== undefined) patch.requires_verification = input.requiresVerification;
  if (input.requiredScore !== undefined) patch.required_score = input.requiredScore;

  if (Object.keys(patch).length === 0) return {};

  const { data, error } = await supabase
    .from("person_requirements")
    .update(patch)
    .eq("id", input.requirementId)
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not update requirement: ${error?.message}` };
  }
  return { requirement: data as PersonRequirement };
}

// Creates a new requirement version and retires the prior one — the only
// path for a substantive change once a requirement has been relied upon in
// a completed audit (also safe to use before that point; it's simply not
// required until then). Mirrors the supersedes_evidence_id /
// supersedes_document_id convention: the NEW row points back at the OLD
// one via supersedes_requirement_id, and the OLD row is marked retired
// (is_active = false, retired_at set) but never deleted.
export async function supersedePersonRequirement(input: {
  priorRequirementId: string;
  requirementCode: string; // must be a new, distinct code — codes are never reused across versions
  name: string;
  description: string | null;
  category: string;
  regulatoryAuthority: string | null;
  domain: string | null;
  requiresDocument: boolean;
  requiresVerification: boolean;
  requiredScore: number | null;
  effectiveDate: string | null;
}): Promise<{ requirement?: PersonRequirement; error?: string }> {
  const supabase = createServerClient();

  const prior = await getRequirementById(input.priorRequirementId);
  if (!prior) {
    return { error: `Prior requirement ${input.priorRequirementId} not found` };
  }

  const { data, error } = await supabase
    .from("person_requirements")
    .insert({
      requirement_code: input.requirementCode,
      name: input.name,
      description: input.description,
      category: input.category,
      regulatory_authority: input.regulatoryAuthority,
      domain: input.domain ?? prior.domain,
      version: prior.version + 1,
      effective_date: input.effectiveDate,
      requires_document: input.requiresDocument,
      requires_verification: input.requiresVerification,
      required_score: input.requiredScore,
      supersedes_requirement_id: input.priorRequirementId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not create superseding requirement: ${error?.message}` };
  }

  const { error: retireError } = await supabase
    .from("person_requirements")
    .update({ is_active: false, retired_at: new Date().toISOString() })
    .eq("id", input.priorRequirementId);

  if (retireError) {
    console.error("[supersedePersonRequirement] retire prior version failed", {
      priorRequirementId: input.priorRequirementId,
      message: retireError.message,
    });
  }

  return { requirement: data as PersonRequirement };
}
