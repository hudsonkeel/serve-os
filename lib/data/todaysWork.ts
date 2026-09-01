// Today's Work aggregation layer — I/O only, mirrors
// getRelationshipBoardRows()'s "N bulk fetchers in one Promise.all, merge
// in memory" skeleton exactly (lib/data/relationships.ts). All
// business logic (mapping, ranking, Continuity Rules) lives in the pure
// lib/workspace/ modules; this file only fetches and hands rows to them.
// See docs/architecture/TODAYS_WORK_CONTINUITY.md — Today's Work is an
// aggregation layer, never a system of record: nothing here writes
// anything, and every produced WorkItem links back to its real source.
import { getRelationshipAttentionStatus } from "../relationships/attention.ts";
import { PROSPECT_RELATIONSHIP_TYPES } from "../relationships/constants.ts";
import {
  mapCompletedIncidentToWorkItem,
  mapCompletedInfectionToWorkItem,
  mapCompletedRelationshipActionToWorkItem,
  mapCompletedWellnessFollowUpToWorkItem,
  mapEmergencyPreparednessObligationToWorkItem,
  mapIncidentToWorkItem,
  mapInfectionToWorkItem,
  mapNoNextActionToWorkItem,
  mapOnHoldRelationshipToWorkItem,
  mapPipelineStageToWorkItem,
  mapRecruitingLeadToWorkItem,
  mapRelationshipActionToWorkItem,
  mapWellnessFollowUpToWorkItem,
} from "../workspace/mapping.ts";
import type { WorkItem } from "../workspace/workItem.ts";
import {
  getNearestOpenActionByRelationship,
  getRecentlyCompletedActions,
  getRelationshipWorkspaceRows,
} from "./relationships.ts";
import { getAllOpenWellnessFollowUps, getRecentlyCompletedWellnessFollowUps } from "./wellnessFollowUps.ts";
import { getRecruitingLeads } from "./recruitingLeads.ts";
import { getActionableIncidents, getRecentlyResolvedIncidents } from "./incidents.ts";
import { getActionableInfections, getRecentlyResolvedInfections } from "./infections.ts";
import { getEmergencyPreparednessReadinessEvaluation } from "../emergencyPreparedness/emergencyPreparednessReadiness.ts";
import { formatCentralDateTime } from "../utils/date.ts";
import { INCIDENT_TYPE_LABELS } from "../../components/incidents/incidentLabels.ts";

const ASSESSMENT_STAGES = new Set(["assessment_scheduled"]);
const PROPOSAL_STAGES = new Set(["proposal_in_progress", "proposal_sent"]);

// Governance Connective Slice v0.1 — reuses the shared requirement
// evaluator's own status labels; Today's Work must never compute due-state
// itself. Only these three statuses represent unresolved, actionable work
// — compliant/not_applicable/exception/satisfied_by_event requirements
// never produce a Today's Work item.
const EPRP_ACTIONABLE_STATUSES = new Set(["due_soon", "overdue", "missing_evidence"]);

export async function getTodaysWorkItems(now: Date = new Date()): Promise<WorkItem[]> {
  const [
    openFollowUps,
    completedFollowUps,
    workspaceRows,
    nearestActions,
    completedActions,
    recruiting,
    actionableIncidents,
    recentlyResolvedIncidents,
    actionableInfections,
    recentlyResolvedInfections,
    eprpEvaluation,
  ] = await Promise.all([
    getAllOpenWellnessFollowUps(),
    getRecentlyCompletedWellnessFollowUps(),
    getRelationshipWorkspaceRows(),
    getNearestOpenActionByRelationship(),
    getRecentlyCompletedActions(),
    getRecruitingLeads(),
    getActionableIncidents(),
    getRecentlyResolvedIncidents(),
    getActionableInfections(),
    getRecentlyResolvedInfections(),
    getEmergencyPreparednessReadinessEvaluation(),
  ]);

  const relationshipById = new Map(workspaceRows.map((r) => [r.id, r]));
  const items: WorkItem[] = [];

  // ─── Wellness follow-ups ───────────────────────────────────────────
  for (const followUp of openFollowUps) {
    items.push(
      mapWellnessFollowUpToWorkItem(
        {
          id: followUp.id,
          residentId: followUp.resident_id,
          residentDisplayName: followUp.residentDisplayName,
          title: followUp.title,
          status: followUp.status as "open" | "in_progress",
          dueAt: followUp.due_at,
          assignedTo: followUp.assigned_to,
          priority: followUp.priority,
        },
        now,
      ),
    );
  }
  for (const followUp of completedFollowUps) {
    items.push(
      mapCompletedWellnessFollowUpToWorkItem({
        id: followUp.id,
        residentId: followUp.residentId,
        residentDisplayName: followUp.residentDisplayName,
        title: followUp.title,
        completedAt: followUp.completedAt,
        completedBy: followUp.completedBy,
      }),
    );
  }

  // ─── Relationship actions (open + recently completed) ──────────────
  for (const [relationshipId, action] of nearestActions) {
    const relationship = relationshipById.get(relationshipId);
    items.push(
      mapRelationshipActionToWorkItem(
        {
          id: action.id,
          relationshipId,
          relationshipDisplayName: relationship?.displayName ?? "Relationship",
          title: action.title,
          dueAt: action.dueAt,
          assignedTo: action.assignedTo,
          priority: action.priority,
        },
        now,
      ),
    );
  }
  for (const action of completedActions) {
    const relationship = relationshipById.get(action.relationshipId);
    items.push(
      mapCompletedRelationshipActionToWorkItem({
        id: action.id,
        relationshipId: action.relationshipId,
        relationshipDisplayName: relationship?.displayName ?? "Relationship",
        title: action.title,
        completedAt: action.completedAt,
        completedBy: action.completedBy,
        completionOutcome: action.completionOutcome,
      }),
    );
  }

  // ─── Assessments / Proposals — Continuity-Rule-gated ────────────────
  for (const relationship of workspaceRows) {
    if (relationship.status !== "active") continue;
    const kind = ASSESSMENT_STAGES.has(relationship.stage) ? "assessment" : PROPOSAL_STAGES.has(relationship.stage) ? "proposal" : null;
    if (!kind) continue;

    const item = mapPipelineStageToWorkItem(
      {
        relationshipId: relationship.id,
        displayName: relationship.displayName,
        ownerLabel: relationship.ownerLabel,
        lastMeaningfulTouchAt: relationship.lastMeaningfulTouchAt,
        updatedAt: relationship.updatedAt,
        kind,
        nearestOpenActionDueAt: nearestActions.get(relationship.id)?.dueAt,
      },
      now,
    );
    if (item) items.push(item);
  }

  // ─── Waiting On (on-hold relationships) ─────────────────────────────
  for (const relationship of workspaceRows) {
    if (relationship.status !== "on_hold") continue;
    items.push(mapOnHoldRelationshipToWorkItem({ relationshipId: relationship.id, displayName: relationship.displayName, ownerLabel: relationship.ownerLabel }));
  }

  // ─── No next action — reuses getRelationshipAttentionStatus verbatim ──
  for (const relationship of workspaceRows) {
    if (relationship.status !== "active") continue;
    if (!PROSPECT_RELATIONSHIP_TYPES.includes(relationship.relationshipType)) continue;

    const nearestOpenActionDueAt = nearestActions.has(relationship.id) ? nearestActions.get(relationship.id)!.dueAt : undefined;
    const attention = getRelationshipAttentionStatus(
      { status: relationship.status, relationshipType: relationship.relationshipType, nearestOpenActionDueAt },
      now,
    );
    if (attention === "no_next_action") {
      items.push(mapNoNextActionToWorkItem({ relationshipId: relationship.id, displayName: relationship.displayName, ownerLabel: relationship.ownerLabel }));
    }
  }

  // ─── Recruiting — Continuity-Rule-gated ─────────────────────────────
  for (const lead of recruiting.leads) {
    const item = mapRecruitingLeadToWorkItem(
      { id: lead.id, firstName: lead.first_name, lastName: lead.last_name, status: lead.status, createdAt: lead.created_at },
      now,
    );
    if (item) items.push(item);
  }

  // ─── Incidents (Governance Connective Slice v0.1) ───────────────────
  for (const incident of actionableIncidents) {
    const typeLabel =
      incident.incident_type === "other" ? incident.incident_type_other || "Other" : INCIDENT_TYPE_LABELS[incident.incident_type];
    items.push(
      mapIncidentToWorkItem({
        id: incident.id,
        typeLabel,
        reviewStatus: incident.review_status,
        followUpRequired: incident.follow_up_required,
        owner: incident.owner,
        occurredAtLabel: formatCentralDateTime(incident.occurred_at) ?? incident.occurred_at,
        residentId: incident.resident_id,
        residentDisplayName: incident.residentDisplayName,
      }),
    );
  }
  for (const incident of recentlyResolvedIncidents) {
    const typeLabel =
      incident.incident_type === "other" ? incident.incident_type_other || "Other" : INCIDENT_TYPE_LABELS[incident.incident_type];
    items.push(
      mapCompletedIncidentToWorkItem({
        id: incident.id,
        typeLabel,
        resolvedAt: incident.resolved_at as string,
        resolvedBy: incident.resolved_by,
      }),
    );
  }

  // ─── Infections (Governance Connective Slice v0.1) ──────────────────
  for (const infection of actionableInfections) {
    items.push(
      mapInfectionToWorkItem({
        id: infection.id,
        reviewStatus: infection.review_status,
        followUpRequired: infection.follow_up_required,
        owner: infection.owner,
        disclosedAtLabel: infection.disclosed_at,
        residentId: infection.resident_id,
        residentDisplayName: infection.residentDisplayName,
      }),
    );
  }
  for (const infection of recentlyResolvedInfections) {
    items.push(
      mapCompletedInfectionToWorkItem({
        id: infection.id,
        residentDisplayName: infection.residentDisplayName,
        resolvedAt: infection.resolved_at as string,
        resolvedBy: infection.resolved_by,
      }),
    );
  }

  // ─── Emergency Preparedness due/overdue requirements (Governance
  // Connective Slice v0.1) — a fresh live read of the same shared
  // evaluator the EPRP/Audit Readiness pages already call; no persisted
  // Obligation row, so a satisfied requirement simply stops appearing on
  // the next read. ─────────────────────────────────────────────────────
  if (eprpEvaluation) {
    for (const req of eprpEvaluation.requirements) {
      if (!EPRP_ACTIONABLE_STATUSES.has(req.status)) continue;
      items.push(
        mapEmergencyPreparednessObligationToWorkItem({
          requirementId: req.requirement.id,
          requirementName: req.requirement.name,
          status: req.status as "due_soon" | "overdue" | "missing_evidence",
          explanation: req.explanation,
          expirationDate: req.latestEvidence?.expiration_date ?? null,
        }),
      );
    }
  }

  return items;
}
