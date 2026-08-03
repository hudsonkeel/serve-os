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
