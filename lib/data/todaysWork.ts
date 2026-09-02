// Today's Work aggregation layer — I/O only, mirrors
// getRelationshipBoardRows()'s "N bulk fetchers in one Promise.all, merge
// in memory" skeleton exactly (lib/data/relationships.ts). All
// business logic (mapping, ranking, Continuity Rules, which mapper fires
// for which row) lives in the pure lib/workspace/ modules — specifically
// lib/workspace/composeTodaysWork.ts's composeTodaysWorkItems(), which this
// file fetches raw rows for and calls. See docs/architecture/
// TODAYS_WORK_CONTINUITY.md — Today's Work is an aggregation layer, never
// a system of record: nothing here writes anything, and every produced
// WorkItem links back to its real source.
import { composeTodaysWorkItems, type CorrectiveActionForCompose } from "../workspace/composeTodaysWork.ts";
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
import { getAllOpenCorrectiveActions } from "./complianceCorrectiveActions.ts";
import { getRequirementsByIds } from "./personRequirements.ts";
import { getResidentDisplayNamesByIds } from "./residentRoster.ts";

// Today's Work Actionability slice, product decision #4 — joins each open
// compliance_corrective_actions row with the two pieces of display context
// it doesn't carry inline (a resident subject's display name; a
// requirement_id's stable requirement_code), both resolved in bulk so this
// stays two extra queries total, never one per action. The pure mapper
// (lib/workspace/mapping.ts#mapCorrectiveActionToWorkItem) never touches
// the database itself.
async function loadCorrectiveActionsForCompose(): Promise<CorrectiveActionForCompose[]> {
  const actions = await getAllOpenCorrectiveActions();
  if (actions.length === 0) return [];

  const residentIds = [...new Set(actions.filter((a) => a.subject_type === "resident").map((a) => a.subject_id))];
  const requirementIds = [...new Set(actions.map((a) => a.requirement_id).filter((id): id is string => id !== null))];

  const [residentNames, requirements] = await Promise.all([
    getResidentDisplayNamesByIds(residentIds),
    getRequirementsByIds(requirementIds),
  ]);

  return actions.map((action) => ({
    id: action.id,
    title: action.title,
    reason: action.reason,
    priority: action.priority,
    dueAt: action.due_at,
    owner: action.owner,
    subjectType: action.subject_type,
    subjectId: action.subject_id,
    subjectLabel: action.subject_type === "resident" ? residentNames.get(action.subject_id) ?? null : null,
    sourceIncidentId: action.source_incident_id,
    sourceInfectionId: action.source_infection_id,
    sourceReviewItemId: action.source_review_item_id,
    requirementCode: action.requirement_id ? requirements.get(action.requirement_id)?.requirement_code ?? null : null,
  }));
}

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
    openCorrectiveActions,
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
    loadCorrectiveActionsForCompose(),
  ]);

  return composeTodaysWorkItems(
    {
      openFollowUps,
      completedFollowUps,
      workspaceRows,
      nearestActions,
      completedActions,
      recruitingLeads: recruiting.leads,
      actionableIncidents,
      recentlyResolvedIncidents,
      actionableInfections,
      recentlyResolvedInfections,
      eprpEvaluation,
      openCorrectiveActions,
    },
    now,
  );
}
