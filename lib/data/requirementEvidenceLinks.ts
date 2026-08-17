// Data layer for the platform-owned many-to-many requirement<->evidence
// link — see supabase/migrations/20260902020000_create_requirement_evidence_links.sql.
// person_evidence.requirement_id remains the primary, sufficient link for
// every existing workforce call site; this table only ever holds
// *additional* requirement<->evidence relationships beyond that primary
// one, always with a stated rationale.
import { createServerClient } from "../supabase/server.ts";
import type { RequirementEvidenceLink } from "../supabase/types.ts";

export async function getEvidenceLinksForRequirement(requirementId: string): Promise<RequirementEvidenceLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("requirement_evidence_links")
    .select("*")
    .eq("requirement_id", requirementId)
    .order("linked_at", { ascending: false });

  if (error) {
    console.error("[getEvidenceLinksForRequirement]", { requirementId, message: error.message });
    return [];
  }

  return (data as RequirementEvidenceLink[] | null) ?? [];
}

export async function getRequirementLinksForEvidence(evidenceId: string): Promise<RequirementEvidenceLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("requirement_evidence_links")
    .select("*")
    .eq("evidence_id", evidenceId)
    .order("linked_at", { ascending: false });

  if (error) {
    console.error("[getRequirementLinksForEvidence]", { evidenceId, message: error.message });
    return [];
  }

  return (data as RequirementEvidenceLink[] | null) ?? [];
}

// Always requires a rationale — no consequential link is ever silent in
// this codebase (see person_vendor_identity_links_resolution_check,
// workforce_activity, etc.). Not idempotent by design: the unique
// (requirement_id, evidence_id) constraint is the DB's own duplicate
// guard, surfaced here as a friendly error.
export async function linkEvidenceToRequirement(input: {
  requirementId: string;
  evidenceId: string;
  rationale: string;
  linkedBy: string;
}): Promise<{ link?: RequirementEvidenceLink; error?: string }> {
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to link evidence to a requirement." };
  }
  if (!input.linkedBy || input.linkedBy.trim().length === 0) {
    return { error: "An authenticated actor is required." };
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("requirement_evidence_links")
    .insert({
      requirement_id: input.requirementId,
      evidence_id: input.evidenceId,
      rationale: input.rationale,
      linked_by: input.linkedBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "This evidence is already linked to this requirement." };
    }
    return { error: `Could not link evidence to requirement: ${error?.message}` };
  }

  return { link: data as RequirementEvidenceLink };
}
