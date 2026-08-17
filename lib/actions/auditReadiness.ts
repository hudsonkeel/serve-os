"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canManageCorrectiveActions, canRunAuditDrill } from "@/lib/compliance/permissions";
import {
  attachCorrectiveActionToAuditSessionItem,
  completeAuditSession,
  recordAuditSessionItem,
  startAuditSession,
} from "@/lib/data/auditSessions";
import { resolveCorrectiveAction, syncCorrectiveAction } from "@/lib/data/complianceCorrectiveActions";
import { linkEvidenceToRequirement } from "@/lib/data/requirementEvidenceLinks";
import { getWorkforceMemberById } from "@/lib/data/workforceMembers";
import { syncComplianceAction } from "@/lib/data/workforceComplianceActions";
import { addAuditSessionCorrection, type ItemCorrectionInput } from "@/lib/data/auditSessionCorrections";
import type {
  AuditSessionItemFinding,
  AuditSessionItemSubjectType,
  ComplianceCorrectiveActionPriority,
  ComplianceCorrectiveActionSubjectType,
  ComplianceCorrectiveActionType,
  WorkforceComplianceActionPriority,
  WorkforceComplianceActionType,
} from "@/lib/supabase/types";

// The minimal Audit Drill workflow (spec Module F, brought forward in
// Phase 1 rather than deferred): start a session, record findings against
// it, attach/resolve corrective actions, complete the session. Phase 4
// (app/audit-readiness/drills/*) is the first UI to consume these.

// Server-side existence guard for the one subject type Phase 4's UI
// actually writes: workforce_member. Neither audit_session_items nor
// compliance_corrective_actions has a real FK on subject_id for this
// subject type (see the KNOWN GAP notes in lib/data/auditSessions.ts and
// lib/data/complianceCorrectiveActions.ts), so nothing enforces this at
// the database layer — this check must not be skipped just because the UI
// picker only ever offers real roster entries. resident/agency/community
// stay unvalidated, per the same already-tracked pre-August-26 hardening
// item — this phase's UI never writes those subject types.
async function assertSubjectExists(
  subjectType: AuditSessionItemSubjectType | ComplianceCorrectiveActionSubjectType,
  subjectId: string
): Promise<string | null> {
  if (subjectType !== "workforce_member") return null;
  const member = await getWorkforceMemberById(subjectId);
  return member ? null : "Workforce member not found.";
}

async function currentActor(): Promise<{ label: string; role: string | null } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, role: profile.role ?? null };
}

export async function startAuditSessionAction(input: {
  name: string;
  description: string | null;
  scopeDomains: string[];
  auditor: string;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to start an audit session." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to start an audit session." };
  }

  return startAuditSession({ ...input, createdBy: actor.label });
}

export async function recordAuditFindingAction(input: {
  sessionId: string;
  requirementId: string;
  subjectType: AuditSessionItemSubjectType;
  subjectId: string;
  evidenceId: string | null;
  finding: AuditSessionItemFinding;
  notes: string | null;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record an audit finding." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to record an audit finding." };
  }

  const subjectError = await assertSubjectExists(input.subjectType, input.subjectId);
  if (subjectError) return { error: subjectError };

  return recordAuditSessionItem({ ...input, createdBy: actor.label });
}

// Creates the corrective action (via the same idempotent sync path the
// dashboard would use outside a drill) and attaches it to the finding that
// prompted it, in one call — Module F's "create a corrective action" step.
export async function createCorrectiveActionFromFindingAction(input: {
  auditSessionItemId: string;
  subjectType: ComplianceCorrectiveActionSubjectType;
  subjectId: string;
  requirementId: string;
  domain: string | null;
  actionType: ComplianceCorrectiveActionType;
  title: string;
  reason: string;
  priority: ComplianceCorrectiveActionPriority;
  dueAt: string | null;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to create a corrective action." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to create a corrective action." };
  }

  const subjectError = await assertSubjectExists(input.subjectType, input.subjectId);
  if (subjectError) return { error: subjectError };

  const { action, error } = await syncCorrectiveAction({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    requirementId: input.requirementId,
    domain: input.domain,
    actionType: input.actionType,
    title: input.title,
    reason: input.reason,
    priority: input.priority,
    dueAt: input.dueAt,
    actor: actor.label,
  });
  if (error || !action) return { error };

  const attach = await attachCorrectiveActionToAuditSessionItem({
    itemId: input.auditSessionItemId,
    correctiveActionId: action.id,
  });
  if (attach.error) return { error: attach.error };

  return { action };
}

// The workforce-native equivalent of createCorrectiveActionFromFindingAction
// above, for the one subject type Phase 4's UI actually walks:
// workforce_member. audit_session_items.corrective_action_id is a hard FK
// to compliance_corrective_actions only (see the migration's own
// subject_type CHECK on that table, which structurally excludes
// workforce_member) — a workforce finding's corrective action belongs in
// workforce_compliance_actions instead, via the same idempotent
// sync_workforce_compliance_action() upsert-by-issue path Workforce's own
// evidence-mutation flows already use (lib/actions/workforce.ts's
// syncComplianceActionsFor). It is deliberately NOT attached back onto the
// audit_session_item row — there is no column that could hold it — so the
// drill UI resolves "does this finding already have an open workforce
// action" by matching (subject, requirement) instead (see
// composeAuditSessionItemView in lib/compliance/auditDrillView.ts).
export async function createWorkforceCorrectiveActionFromFindingAction(input: {
  workforceMemberId: string;
  requirementId: string;
  actionType: WorkforceComplianceActionType;
  title: string;
  reason: string;
  priority: WorkforceComplianceActionPriority;
  dueAt: string | null;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to create a corrective action." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to create a corrective action." };
  }

  const subjectError = await assertSubjectExists("workforce_member", input.workforceMemberId);
  if (subjectError) return { error: subjectError };

  return syncComplianceAction({
    workforceMemberId: input.workforceMemberId,
    requirementId: input.requirementId,
    actionType: input.actionType,
    title: input.title,
    reason: input.reason,
    priority: input.priority,
    dueAt: input.dueAt,
    actor: actor.label,
  });
}

export async function resolveCorrectiveActionAction(input: {
  actionId: string;
  status: "resolved" | "dismissed";
  resolutionNote: string;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to resolve a corrective action." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to resolve a corrective action." };
  }

  return resolveCorrectiveAction({ ...input, actor: actor.label });
}

export async function completeAuditSessionAction(input: { sessionId: string; summary: string | null }) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to complete an audit session." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to complete an audit session." };
  }

  return completeAuditSession({ sessionId: input.sessionId, summary: input.summary, actor: actor.label });
}

// Locks a Correction Mode session: one governed correction event covering
// every item-level change the user made (edited/added/removed), reviewed
// as one diff, under one rationale. Never edits the original recorded
// findings — see lib/compliance/auditDrillView.ts's getCorrectedSessionView
// for how the effective (corrected-if-corrected) view is composed on read
// without ever touching audit_session_items. The RPC itself refuses this
// for a session that isn't completed yet (an in-progress session is still
// directly editable through the normal record-finding flow).
export async function addAuditSessionCorrectionAction(input: {
  sessionId: string;
  rationale: string;
  itemCorrections: ItemCorrectionInput[];
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to correct an audit session." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to correct an audit session." };
  }
  if (input.itemCorrections.length === 0) {
    return { error: "At least one change is required." };
  }

  return addAuditSessionCorrection({ ...input, actor: actor.label });
}

export async function linkEvidenceToRequirementAction(input: {
  requirementId: string;
  evidenceId: string;
  rationale: string;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to link evidence to a requirement." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to link evidence to a requirement." };
  }

  return linkEvidenceToRequirement({ ...input, linkedBy: actor.label });
}
