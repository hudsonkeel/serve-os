"use server";

// Server-action layer for compliance_corrective_actions' generic lifecycle
// operations (implementation, cancellation, effectiveness-review outcome,
// follow-up updates) — domain-agnostic on purpose. None of these four
// operate on an incident, an infection, or any other source record; they
// take a corrective-action (or effectiveness-review) id directly and
// mutate compliance_corrective_actions / corrective_action_effectiveness_reviews /
// corrective_action_updates, which are themselves shared, source-agnostic
// tables (see 20260910000000_add_incident_corrective_action_lifecycle.sql).
//
// Extracted from lib/actions/incidents.ts (Incident Corrective Action
// Lifecycle v0.1 reuse review) — they lived there only because incidents
// were the first caller to need them, not because they contain any
// incident-specific logic. Only creating a NEW corrective action stays
// domain-specific (see createIncidentCorrectiveActionAction in
// lib/actions/incidents.ts): it has to resolve a subject and validate
// eligibility from its source record, which differs per domain. Any future
// QAPI domain (Infection Lifecycle v0.1 and beyond) can call the four
// actions here directly, unchanged, once it has its own creation action
// producing rows in the same shared tables.
//
// Follows lib/actions/auditReadiness.ts's exact shape: a private
// currentActor() helper, a canX(role) gate before every data-layer call,
// never trusting a client-supplied actor identity.
import { getCurrentAuthorizedUser } from "../auth/session.ts";
import { canManageCorrectiveActions, canVoidEffectivenessReviewOutcome } from "../compliance/permissions.ts";
import {
  addCorrectiveActionUpdate,
  cancelCorrectiveActionImplementation,
  markCorrectiveActionImplemented,
  recordEffectivenessReviewOutcome,
  voidEffectivenessReviewOutcome,
} from "../data/complianceCorrectiveActions.ts";
import type {
  ComplianceCorrectiveAction,
  CorrectiveActionEffectivenessReview,
  CorrectiveActionUpdate,
  EffectivenessReviewOutcome,
} from "../supabase/types.ts";

async function currentActor(): Promise<{ label: string; role: string | null } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, role: profile.role };
}

// IMPLEMENTED means the corrective intervention has been put in place — it
// does not mean the action has been proven effective. See
// mark_corrective_action_implemented's own migration comment for the
// status-auto-close rule this triggers.
export async function markCorrectiveActionImplementedAction(input: {
  actionId: string;
}): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to update a corrective action." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to update this corrective action." };
  }

  return markCorrectiveActionImplemented({ actionId: input.actionId, actor: actor.label });
}

// Explicit, reasoned withdrawal — never silently equivalent to effectiveness
// verification. See cancel_corrective_action_implementation's own migration
// comment.
export async function cancelCorrectiveActionImplementationAction(input: {
  actionId: string;
  cancellationNote: string;
}): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to cancel a corrective action." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to cancel this corrective action." };
  }

  return cancelCorrectiveActionImplementation({
    actionId: input.actionId,
    actor: actor.label,
    cancellationNote: input.cancellationNote,
  });
}

export async function recordEffectivenessReviewOutcomeAction(input: {
  reviewId: string;
  outcome: EffectivenessReviewOutcome;
  evidence: string;
}): Promise<{ review?: CorrectiveActionEffectivenessReview; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record an effectiveness review outcome." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to record an effectiveness review outcome." };
  }

  return recordEffectivenessReviewOutcome({
    reviewId: input.reviewId,
    outcome: input.outcome,
    evidence: input.evidence,
    actor: actor.label,
  });
}

// Admin-only (canVoidEffectivenessReviewOutcome): reverses a recorded
// compliance determination and reopens an already-resolved corrective
// action — a materially different trust tier than the admin+manager tier
// that governs the normal forward lifecycle. See
// 20260912010000_add_effectiveness_review_void_mechanism.sql for the full
// audit-preservation guarantee (immutable voided_* snapshot, append-only
// corrective_action_updates entry, no data ever deleted or overwritten in
// place).
export async function voidEffectivenessReviewOutcomeAction(input: {
  reviewId: string;
  voidReason: string;
}): Promise<{ review?: CorrectiveActionEffectivenessReview; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to void an effectiveness review outcome." };
  if (!canVoidEffectivenessReviewOutcome(actor.role)) {
    return { error: "You do not have permission to void an effectiveness review outcome." };
  }

  return voidEffectivenessReviewOutcome({
    reviewId: input.reviewId,
    actor: actor.label,
    voidReason: input.voidReason,
  });
}

export async function addCorrectiveActionUpdateAction(input: {
  correctiveActionId: string;
  body: string;
}): Promise<{ update?: CorrectiveActionUpdate; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to add a follow-up update." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to add a follow-up update." };
  }

  return addCorrectiveActionUpdate({
    correctiveActionId: input.correctiveActionId,
    body: input.body,
    actor: actor.label,
  });
}
