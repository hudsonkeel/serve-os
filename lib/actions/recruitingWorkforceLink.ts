"use server";

// Governed correction actions for the recruiting-lead ↔ workforce-member
// review queue (see lib/data/recruitingWorkforceReview.ts and
// supabase/migrations/20260829000000_add_recruiting_lead_workforce_link.sql).
// Same governance boundary and pattern as lib/actions/reconciliation.ts
// (admin/manager/executive, actor+rationale required, append-only
// decision history) — reused, not reinvented, per the instruction to
// reuse an existing governance mechanism where one can be reused cleanly.
import { revalidatePath } from "next/cache";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { createServerClient } from "@/lib/supabase/server";
import type { RecruitingResolutionBasis } from "@/lib/recruitingLeads/workforceResolution";

type RecruitingLinkActionResult = { error?: string; success?: boolean };

async function requireRecruitingLinkActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to make recruiting/workforce linkage decisions." };
  }
  return { actor: profile.full_name?.trim() || profile.email };
}

function revalidateRecruitingViews() {
  revalidatePath("/recruiting");
  revalidatePath("/workforce/identity-review");
}

export async function confirmRecruitingWorkforceLink(input: {
  recruitingLeadId: string;
  workforceMemberId: string;
  matchBasis: RecruitingResolutionBasis | null;
  rationale: string;
}): Promise<RecruitingLinkActionResult> {
  if (!input.rationale.trim()) return { error: "A rationale is required to confirm this link." };
  const actorResult = await requireRecruitingLinkActor();
  if ("error" in actorResult) return actorResult;

  const supabase = createServerClient();
  const { error } = await supabase.rpc("confirm_recruiting_lead_workforce_link", {
    p_recruiting_lead_id: input.recruitingLeadId,
    p_workforce_member_id: input.workforceMemberId,
    p_match_basis: input.matchBasis,
    p_actor: actorResult.actor,
    p_rationale: input.rationale.trim(),
  });
  if (error) return { error: `Could not confirm link: ${error.message}` };

  revalidateRecruitingViews();
  return { success: true };
}

export async function recordRecruitingWorkforceLinkDecision(input: {
  recruitingLeadId: string;
  workforceMemberId: string;
  decision: "rejected" | "deferred";
  matchBasis: RecruitingResolutionBasis | null;
  rationale: string;
}): Promise<RecruitingLinkActionResult> {
  if (!input.rationale.trim()) return { error: "A rationale is required." };
  const actorResult = await requireRecruitingLinkActor();
  if ("error" in actorResult) return actorResult;

  const supabase = createServerClient();
  const { error } = await supabase.rpc("record_recruiting_lead_workforce_link_decision", {
    p_recruiting_lead_id: input.recruitingLeadId,
    p_workforce_member_id: input.workforceMemberId,
    p_decision: input.decision,
    p_match_basis: input.matchBasis,
    p_actor: actorResult.actor,
    p_rationale: input.rationale.trim(),
  });
  if (error) return { error: `Could not record decision: ${error.message}` };

  revalidateRecruitingViews();
  return { success: true };
}
