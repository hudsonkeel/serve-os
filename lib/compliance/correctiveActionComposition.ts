// Composes workforce_compliance_actions (owned by the Workforce domain,
// via lib/data/workforceComplianceActions.ts, completely untouched) and
// compliance_corrective_actions (owned by Audit Readiness's own native
// domains — Emergency Preparedness, Client File Readiness — via
// lib/data/complianceCorrectiveActions.ts) into one read-only, source-
// labeled list.
//
// This is the composition point the governing principle asks for: "Audit
// Readiness should compose the readiness state of those domains into a
// unified, explainable audit view — not recreate them inside an Audit
// Readiness silo." Neither underlying table, RPC, or sync function is
// touched, wrapped, or reimplemented here — this file only reads both and
// merges the results for presentation. Writes always go directly to
// whichever domain's own data-layer function owns the record
// (syncComplianceAction/resolveComplianceAction for workforce;
// syncCorrectiveAction/resolveCorrectiveAction for audit-native domains) —
// there is no write path here and there should never be one.
import { getAllOpenComplianceActions } from "../data/workforceComplianceActions.ts";
import { getAllOpenCorrectiveActions } from "../data/complianceCorrectiveActions.ts";
import type { ComplianceCorrectiveAction, WorkforceComplianceAction } from "../supabase/types.ts";

export type ComposedCorrectiveActionSource = "workforce" | "audit_readiness";

export interface ComposedCorrectiveAction {
  id: string;
  source: ComposedCorrectiveActionSource;
  subjectType: "workforce_member" | "resident" | "agency" | "community";
  subjectId: string;
  requirementId: string | null;
  domain: string | null;
  // Passthrough of each source table's own action_type column (2026-08-25,
  // QAPI v0.1) — added so a consumer can summarize "what kinds of work are
  // represented" (see lib/qapi/dashboard.ts's bucket summaries) without a
  // second read. Both source tables have this column; kept as a plain
  // string here rather than a shared union since WorkforceComplianceActionType
  // and ComplianceCorrectiveActionType are two distinct (overlapping but
  // not identical — the latter also has audit_finding_failed) enums, and
  // this file has no reason to force them into one.
  actionType: string;
  title: string;
  reason: string;
  owner: string | null;
  priority: WorkforceComplianceAction["priority"];
  dueAt: string | null;
  status: WorkforceComplianceAction["status"];
  createdAt: string;
  // Governance Connective Slice v0.1 — passthrough of
  // compliance_corrective_actions' own source columns (same "why" as
  // actionType's passthrough above: lets a consumer, e.g.
  // lib/qapi/signals.ts, summarize "how much open work traces back to a
  // specific Incident/Infection/EPRP finding" without a second read).
  // Always null for workforce-sourced rows — those columns only exist on
  // compliance_corrective_actions.
  sourceIncidentId: string | null;
  sourceInfectionId: string | null;
  sourceReviewItemId: string | null;
}

function fromWorkforce(action: WorkforceComplianceAction): ComposedCorrectiveAction {
  return {
    id: action.id,
    source: "workforce",
    subjectType: "workforce_member",
    subjectId: action.workforce_member_id,
    requirementId: action.requirement_id,
    domain: "workforce",
    actionType: action.action_type,
    title: action.title,
    reason: action.reason,
    owner: action.owner,
    priority: action.priority,
    dueAt: action.due_at,
    status: action.status,
    createdAt: action.created_at,
    sourceIncidentId: null,
    sourceInfectionId: null,
    sourceReviewItemId: null,
  };
}

function fromAuditReadiness(action: ComplianceCorrectiveAction): ComposedCorrectiveAction {
  return {
    id: action.id,
    source: "audit_readiness",
    subjectType: action.subject_type,
    subjectId: action.subject_id,
    requirementId: action.requirement_id,
    domain: action.domain,
    actionType: action.action_type,
    title: action.title,
    reason: action.reason,
    owner: action.owner,
    priority: action.priority,
    dueAt: action.due_at,
    status: action.status,
    createdAt: action.created_at,
    sourceIncidentId: action.source_incident_id,
    sourceInfectionId: action.source_infection_id,
    sourceReviewItemId: action.source_review_item_id,
  };
}

const PRIORITY_RANK: Record<WorkforceComplianceAction["priority"], number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

// Pure — merges and sorts two already-fetched lists. Separated from the
// I/O below so the merge/sort behavior itself (priority ordering, due-date
// tiebreaking, source labeling) is unit-testable without a database.
export function composeCorrectiveActions(
  workforceActions: readonly WorkforceComplianceAction[],
  auditReadinessActions: readonly ComplianceCorrectiveAction[]
): ComposedCorrectiveAction[] {
  const composed = [...workforceActions.map(fromWorkforce), ...auditReadinessActions.map(fromAuditReadiness)];

  composed.sort((a, b) => {
    const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    if (a.dueAt === null && b.dueAt === null) return 0;
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  return composed;
}

// The Audit Readiness dashboard's single "Open Corrective Actions" read —
// every open action, from either source. I/O only; all merge/sort logic
// lives in composeCorrectiveActions() above.
export async function getAllOpenCorrectiveActionsComposed(): Promise<ComposedCorrectiveAction[]> {
  const [workforceActions, auditReadinessActions] = await Promise.all([
    getAllOpenComplianceActions(),
    getAllOpenCorrectiveActions(),
  ]);

  return composeCorrectiveActions(workforceActions, auditReadinessActions);
}
