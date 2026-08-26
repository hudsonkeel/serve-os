// Data layer for emergency_preparedness_reviews / _review_items — the
// Annual Review mechanism. See
// supabase/migrations/20260902090000_create_emergency_preparedness_reviews.sql
// and lib/emergencyPreparedness/emergencyPreparednessReviews.ts for the
// business orchestration (which outcomes do/don't create person_evidence)
// built on top of this file's plain CRUD.
import { createServerClient } from "../supabase/server.ts";
import type {
  EmergencyPreparednessReview,
  EmergencyPreparednessReviewItem,
  EmergencyPreparednessReviewItemKind,
  EmergencyPreparednessReviewOutcome,
} from "../supabase/types.ts";

export async function startEmergencyPreparednessReview(reviewer: string): Promise<{ review?: EmergencyPreparednessReview; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("emergency_preparedness_reviews")
    .insert({ reviewer })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not start Emergency Preparedness review: ${error?.message}` };
  }

  return { review: data as EmergencyPreparednessReview };
}

export async function getEmergencyPreparednessReviewById(id: string): Promise<EmergencyPreparednessReview | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("emergency_preparedness_reviews").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getEmergencyPreparednessReviewById]", { id, message: error.message });
    return null;
  }

  return (data as EmergencyPreparednessReview | null) ?? null;
}

export async function listEmergencyPreparednessReviews(): Promise<EmergencyPreparednessReview[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("emergency_preparedness_reviews")
    .select("*")
    .order("started_at", { ascending: false });

  if (error) {
    console.error("[listEmergencyPreparednessReviews]", { message: error.message });
    return [];
  }

  return (data as EmergencyPreparednessReview[] | null) ?? [];
}

// Same discipline as getAuditSessionItems(): status-agnostic, so this one
// read serves both the active-review screen and the read-only historical
// view — the DB's completion-lock trigger is the real "reopen and see
// exactly what was reviewed" guarantee.
export async function getEmergencyPreparednessReviewItems(reviewId: string): Promise<EmergencyPreparednessReviewItem[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("emergency_preparedness_review_items")
    .select("*")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getEmergencyPreparednessReviewItems]", { reviewId, message: error.message });
    return [];
  }

  return (data as EmergencyPreparednessReviewItem[] | null) ?? [];
}

export async function insertEmergencyPreparednessReviewItem(input: {
  reviewId: string;
  itemKind: EmergencyPreparednessReviewItemKind;
  requirementId: string | null;
  outcome: EmergencyPreparednessReviewOutcome | null;
  resultingEvidenceId: string | null;
  description: string | null;
  notes: string | null;
  createdBy: string;
}): Promise<{ item?: EmergencyPreparednessReviewItem; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("emergency_preparedness_review_items")
    .insert({
      review_id: input.reviewId,
      item_kind: input.itemKind,
      requirement_id: input.requirementId,
      outcome: input.outcome,
      resulting_evidence_id: input.resultingEvidenceId,
      description: input.description,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not record review item: ${error?.message}` };
  }

  return { item: data as EmergencyPreparednessReviewItem };
}

// Cross-review read for QAPI v0.1 (2026-08-25) — every "improvement"
// item plus every "requirement_finding" item whose outcome still implies
// follow-up (evidence_needed/needs_review), regardless of which review it
// belongs to or whether that review is completed. Deliberately NOT called
// "open" items: review items have no status/completion field at all (see
// this table's own migration and lib/emergencyPreparednessReviews.ts's
// comments), so there is no way to know whether a given item has actually
// been addressed since it was recorded — QAPI must present these as
// "recorded," not claim a resolution state Serve OS cannot verify.
export async function listRecentEmergencyPreparednessReviewFollowUpItems(limit = 20): Promise<EmergencyPreparednessReviewItem[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("emergency_preparedness_review_items")
    .select("*")
    .or("item_kind.eq.improvement,outcome.in.(evidence_needed,needs_review)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[listRecentEmergencyPreparednessReviewFollowUpItems]", { message: error.message });
    return [];
  }

  return (data as EmergencyPreparednessReviewItem[] | null) ?? [];
}

// The one-way transition — see complete_emergency_preparedness_review() in
// the migration. Only succeeds from a non-completed status; the DB trigger
// then makes every item belonging to this review immutable.
export async function completeEmergencyPreparednessReview(input: {
  reviewId: string;
  summary: string | null;
  actor: string;
}): Promise<{ review?: EmergencyPreparednessReview; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("complete_emergency_preparedness_review", {
      p_review_id: input.reviewId,
      p_summary: input.summary,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not complete Emergency Preparedness review: ${error?.message}` };
  }

  return { review: data as EmergencyPreparednessReview };
}
