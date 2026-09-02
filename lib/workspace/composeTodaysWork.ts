// Pure assembly logic for Today's Work — every already-fetched raw row
// gets turned into WorkItem[] here. No I/O; lib/data/todaysWork.ts does
// the fetching (Promise.all of bulk queries) and calls this. Mirrors
// lib/compliance/correctiveActionComposition.ts's own "I/O fetches, a pure
// function merges/decides" split, and exists for the same reason: so the
// composition/eligibility decisions (which mapper fires, which Continuity
// Rule gates it, which relationships produce nothing at all) are
// unit-testable without a database. See docs/architecture/
// TODAYS_WORK_CONTINUITY.md.
import { getRelationshipAttentionStatus } from "../relationships/attention.ts";
import {
  mapCompletedIncidentToWorkItem,
  mapCompletedInfectionToWorkItem,
  mapCompletedRelationshipActionToWorkItem,
  mapCompletedWellnessFollowUpToWorkItem,
  mapCorrectiveActionToWorkItem,
  mapEmergencyPreparednessObligationToWorkItem,
  mapIncidentToWorkItem,
  mapInfectionToWorkItem,
  mapOnHoldRelationshipToWorkItem,
  mapPipelineStageToWorkItem,
  mapRecruitingLeadToWorkItem,
  mapRelationshipActionToWorkItem,
  mapWellnessFollowUpToWorkItem,
  type CorrectiveActionWorkItemPriority,
} from "./mapping.ts";
import type { WorkItem } from "./workItem.ts";
import type { RelationshipWorkspaceRow } from "../relationships/search.ts";
import type { NearestOpenAction, RecentlyCompletedAction } from "../data/relationships.ts";
import type { OpenWellnessFollowUpWithResident, RecentlyCompletedWellnessFollowUp } from "../data/wellnessFollowUps.ts";
import type { IncidentWithResidentName } from "../data/incidents.ts";
import type { InfectionWithResidentName } from "../data/infections.ts";
import type { RecruitingLead } from "../supabase/types.ts";
import type { EmergencyPreparednessReadinessEvaluation } from "../emergencyPreparedness/emergencyPreparednessReadiness.ts";
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

// One already-fetched, already-joined compliance_corrective_actions row —
// the I/O layer resolves subjectLabel (resident display name) and
// requirementCode (person_requirements.requirement_code) in bulk before
// calling composeTodaysWorkItems, so this module stays pure/no I/O. Status
// is always "open": resolved/dismissed actions are never fetched in the
// first place (see getAllOpenCorrectiveActions()), so there is nothing to
// filter out here.
export interface CorrectiveActionForCompose {
  id: string;
  title: string;
  reason: string;
  priority: CorrectiveActionWorkItemPriority;
  dueAt: string | null;
  owner: string | null;
  subjectType: "resident" | "agency" | "community";
  subjectId: string;
  subjectLabel: string | null;
  sourceIncidentId: string | null;
  sourceInfectionId: string | null;
  sourceReviewItemId: string | null;
  requirementCode: string | null;
}

export interface ComposeTodaysWorkInput {
  openFollowUps: readonly OpenWellnessFollowUpWithResident[];
  completedFollowUps: readonly RecentlyCompletedWellnessFollowUp[];
  workspaceRows: readonly RelationshipWorkspaceRow[];
  nearestActions: ReadonlyMap<string, NearestOpenAction>;
  completedActions: readonly RecentlyCompletedAction[];
  recruitingLeads: readonly RecruitingLead[];
  actionableIncidents: readonly IncidentWithResidentName[];
  recentlyResolvedIncidents: readonly IncidentWithResidentName[];
  actionableInfections: readonly InfectionWithResidentName[];
  recentlyResolvedInfections: readonly InfectionWithResidentName[];
  eprpEvaluation: EmergencyPreparednessReadinessEvaluation | null;
  openCorrectiveActions: readonly CorrectiveActionForCompose[];
}

export function composeTodaysWorkItems(input: ComposeTodaysWorkInput, now: Date = new Date()): WorkItem[] {
  const relationshipById = new Map(input.workspaceRows.map((r) => [r.id, r]));
  const items: WorkItem[] = [];

  // ─── Wellness follow-ups ───────────────────────────────────────────
  for (const followUp of input.openFollowUps) {
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
  for (const followUp of input.completedFollowUps) {
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
  for (const [relationshipId, action] of input.nearestActions) {
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
  for (const action of input.completedActions) {
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
  for (const relationship of input.workspaceRows) {
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
        nearestOpenActionDueAt: input.nearestActions.get(relationship.id)?.dueAt,
      },
      now,
    );
    if (item) items.push(item);
  }

  // ─── Waiting On (on-hold relationships) — informational/monitoring,
  // never counted as actionable workload (see WORK_SECTION_CONFIG's
  // "waiting" section and this slice's Operational Summary derivation,
  // which only sums needs_attention/in_progress/due_today/upcoming items
  // per source). ─────────────────────────────────────────────────────
  for (const relationship of input.workspaceRows) {
    if (relationship.status !== "on_hold") continue;
    items.push(mapOnHoldRelationshipToWorkItem({ relationshipId: relationship.id, displayName: relationship.displayName, ownerLabel: relationship.ownerLabel }));
  }

  // Today's Work Actionability slice, product decision #1 — a bare
  // "active Prospect relationship with no open action" is CRM state, not
  // work, and no longer produces a WorkItem here at all (previously
  // mapNoNextActionToWorkItem via getRelationshipAttentionStatus's
  // "no_next_action" bucket). That bucket itself is untouched — it still
  // exists for lib/relationships/attention.ts's other consumers (the
  // Relationships board/whiteboard's own badge display) — Today's Work
  // simply stopped being one of its consumers. A Prospect still enters
  // Today's Work exactly when a real actionable condition exists: an
  // explicit relationship_action row (above), or the Assessment/Proposal
  // Continuity Rule (above) — never merely for lacking one.

  // ─── Recruiting — Continuity-Rule-gated ─────────────────────────────
  for (const lead of input.recruitingLeads) {
    const item = mapRecruitingLeadToWorkItem(
      { id: lead.id, firstName: lead.first_name, lastName: lead.last_name, status: lead.status, createdAt: lead.created_at },
      now,
    );
    if (item) items.push(item);
  }

  // ─── Incidents (Governance Connective Slice v0.1) ───────────────────
  for (const incident of input.actionableIncidents) {
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
  for (const incident of input.recentlyResolvedIncidents) {
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
  for (const infection of input.actionableInfections) {
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
  for (const infection of input.recentlyResolvedInfections) {
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
  if (input.eprpEvaluation) {
    for (const req of input.eprpEvaluation.requirements) {
      if (!EPRP_ACTIONABLE_STATUSES.has(req.status)) continue;
      items.push(
        mapEmergencyPreparednessObligationToWorkItem({
          requirementId: req.requirement.id,
          requirementCode: req.requirement.requirement_code,
          requirementName: req.requirement.name,
          status: req.status as "due_soon" | "overdue" | "missing_evidence",
          explanation: req.explanation,
          expirationDate: req.latestEvidence?.expiration_date ?? null,
        }),
      );
    }
  }

  // ─── Corrective Actions (Today's Work Actionability slice, product
  // decision #4) — composed independently of whichever Incident/Infection/
  // EPRP requirement (if any) created them. Already filtered to status
  // 'open' by getAllOpenCorrectiveActions(); an Action whose originating
  // Incident/Infection/EPRP requirement has since resolved still appears
  // here until the Action itself is resolved. ─────────────────────────
  for (const action of input.openCorrectiveActions) {
    items.push(
      mapCorrectiveActionToWorkItem(
        {
          id: action.id,
          title: action.title,
          reason: action.reason,
          status: "open",
          priority: action.priority,
          dueAt: action.dueAt,
          owner: action.owner,
          subjectType: action.subjectType,
          subjectId: action.subjectId,
          subjectLabel: action.subjectLabel,
          sourceIncidentId: action.sourceIncidentId,
          sourceInfectionId: action.sourceInfectionId,
          sourceReviewItemId: action.sourceReviewItemId,
          requirementCode: action.requirementCode,
        },
        now,
      ),
    );
  }

  return items;
}
