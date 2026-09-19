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
import {
  composeTodaysWorkItems,
  filterCorrectiveActionsForViewer,
  type CorrectiveActionForCompose,
  type EffectivenessReviewForCompose,
  type InfectionFollowUpForCompose,
  type TodaysWorkGovernanceCapabilities,
} from "../workspace/composeTodaysWork.ts";
import type { WorkItem } from "../workspace/workItem.ts";
import { canVerifyResidentEvidence } from "../auth/permissions.ts";
import { canViewAuditReadiness, canViewIncidentsAndInfections } from "../compliance/permissions.ts";
import type { AuthRole } from "../auth/constants.ts";
import {
  getNearestOpenActionByRelationship,
  getRecentlyCompletedActions,
  getRelationshipWorkspaceRows,
} from "./relationships.ts";
import { getAllOpenWellnessFollowUps, getRecentlyCompletedWellnessFollowUps } from "./wellnessFollowUps.ts";
import { getRecruitingLeads } from "./recruitingLeads.ts";
import { getActionableIncidents, getRecentlyResolvedIncidents, type IncidentWithResidentName } from "./incidents.ts";
import {
  getActionableInfections,
  getInfectionsWithOutstandingFollowUp,
  getRecentlyResolvedInfections,
  type InfectionWithResidentName,
} from "./infections.ts";
import { getEmergencyPreparednessReadinessEvaluation } from "../emergencyPreparedness/emergencyPreparednessReadiness.ts";
import {
  getAllOpenCorrectiveActions,
  getComplianceCorrectiveActionsByIds,
  getPendingEffectivenessReviews,
} from "./complianceCorrectiveActions.ts";
import { getRequirementsByIds } from "./personRequirements.ts";
import { getResidentDisplayNamesByIds } from "./residentRoster.ts";

// Today's Work Actionability slice, product decision #4 — joins each open
// compliance_corrective_actions row with the two pieces of display context
// it doesn't carry inline (a resident subject's display name; a
// requirement_id's stable requirement_code), both resolved in bulk so this
// stays two extra queries total, never one per action. The pure mapper
// (lib/workspace/mapping.ts#mapCorrectiveActionToWorkItem) never touches
// the database itself.
// capabilities — Today's Work Viewer Scoping v0.1 (extends the Office
// Staff Client Readiness UX v0.2 verification filter): excludes any
// corrective action whose own domain/source the viewer structurally
// cannot act on (see isCorrectiveActionVisibleToViewer's comment,
// lib/workspace/composeTodaysWork.ts) — Client Readiness verification
// handoffs, Incident/Infection follow-ups, and Emergency Preparedness
// corrective actions are each checked against the same capability
// predicate that already gates that domain's own destination page. Never
// touches getAllOpenCorrectiveActions() itself (that function backs the
// Governance dashboard/QAPI rollups too, which must keep showing every
// open action regardless of who's viewing Today's Work) — filtered only
// here, at the Today's-Work-specific composition boundary, and only on
// the array this function returns, never on the underlying rows
// getAllOpenCorrectiveActions() fetched.
async function loadCorrectiveActionsForCompose(capabilities: TodaysWorkGovernanceCapabilities): Promise<CorrectiveActionForCompose[]> {
  const allActions = await getAllOpenCorrectiveActions();
  const actions = filterCorrectiveActionsForViewer(
    allActions.map((a) => ({ ...a, actionType: a.action_type })),
    capabilities
  );
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
    lifecycleStage: action.lifecycle_stage,
  }));
}

// Incident Corrective Action Lifecycle v0.1 — Today's Work integration for
// effectiveness-review due dates. A scheduled review only becomes real,
// actionable work once its parent corrective action has actually reached
// lifecycle_stage='implemented' (before that, nagging about an
// effectiveness check would be premature — the intervention hasn't even
// happened yet); getPendingEffectivenessReviews() already filters to
// outcome IS NULL, so this only needs to additionally filter by the
// parent's lifecycle_stage, which requires joining in the parent rows —
// done here, in bulk, never per-review. The pure mapper
// (lib/workspace/mapping.ts#mapEffectivenessReviewToWorkItem) never
// touches the database itself.
async function loadEffectivenessReviewsForCompose(): Promise<EffectivenessReviewForCompose[]> {
  const reviews = await getPendingEffectivenessReviews();
  if (reviews.length === 0) return [];

  const actionIds = [...new Set(reviews.map((r) => r.corrective_action_id))];
  const actions = await getComplianceCorrectiveActionsByIds(actionIds);
  const actionById = new Map(actions.map((a) => [a.id, a]));

  const implementedReviews = reviews.filter((r) => actionById.get(r.corrective_action_id)?.lifecycle_stage === "implemented");
  if (implementedReviews.length === 0) return [];

  const residentIds = [
    ...new Set(
      implementedReviews
        .map((r) => actionById.get(r.corrective_action_id))
        .filter((a): a is NonNullable<typeof a> => a !== undefined && a.subject_type === "resident")
        .map((a) => a.subject_id)
    ),
  ];
  const residentNames = await getResidentDisplayNamesByIds(residentIds);

  return implementedReviews.map((review) => {
    const action = actionById.get(review.corrective_action_id)!;
    return {
      id: review.id,
      correctiveActionTitle: action.title,
      dueAt: review.due_at,
      owner: review.owner ?? action.owner,
      subjectType: action.subject_type,
      subjectId: action.subject_id,
      subjectLabel: action.subject_type === "resident" ? (residentNames.get(action.subject_id) ?? null) : null,
      sourceIncidentId: action.source_incident_id,
      sourceInfectionId: action.source_infection_id,
    };
  });
}

// Infection Lifecycle & Learning Loop v0.1 — Today's Work integration for
// an infection's own outstanding follow-up obligation. No Incident analog.
// The pure mapper (lib/workspace/mapping.ts#mapInfectionFollowUpToWorkItem)
// never touches the database itself.
async function loadOutstandingInfectionFollowUpsForCompose(): Promise<InfectionFollowUpForCompose[]> {
  const infections = await getInfectionsWithOutstandingFollowUp();
  if (infections.length === 0) return [];

  const residentIds = [...new Set(infections.map((i) => i.resident_id))];
  const residentNames = await getResidentDisplayNamesByIds(residentIds);

  return infections.map((infection) => ({
    infectionId: infection.id,
    nextFollowUpDate: infection.next_follow_up_date as string,
    purpose: infection.next_follow_up_purpose as NonNullable<typeof infection.next_follow_up_purpose>,
    owner: infection.owner,
    residentId: infection.resident_id,
    residentDisplayName: residentNames.get(infection.resident_id) ?? null,
  }));
}

// Today's Work Viewer Scoping v0.1 — Incidents, Infections, their
// effectiveness reviews, and infection follow-up obligations are all
// gated behind the SAME canViewIncidentsAndInfections() capability that
// already gates /qapi/incidents/[id] and /qapi/infections/[id] (see
// lib/compliance/permissions.ts). Bundled into one loader so a viewer
// lacking that capability skips every one of these fetches entirely,
// rather than fetching organization-wide Incident/Infection data only to
// filter it back out downstream — matching this codebase's established
// `capability ? await fetch() : []` idiom for capability-gated data.
async function loadIncidentsAndInfectionsForCompose(canViewerSeeIncidentsAndInfections: boolean): Promise<{
  actionableIncidents: IncidentWithResidentName[];
  recentlyResolvedIncidents: IncidentWithResidentName[];
  actionableInfections: InfectionWithResidentName[];
  recentlyResolvedInfections: InfectionWithResidentName[];
  pendingEffectivenessReviews: EffectivenessReviewForCompose[];
  outstandingInfectionFollowUps: InfectionFollowUpForCompose[];
}> {
  if (!canViewerSeeIncidentsAndInfections) {
    return {
      actionableIncidents: [],
      recentlyResolvedIncidents: [],
      actionableInfections: [],
      recentlyResolvedInfections: [],
      pendingEffectivenessReviews: [],
      outstandingInfectionFollowUps: [],
    };
  }

  const [
    actionableIncidents,
    recentlyResolvedIncidents,
    actionableInfections,
    recentlyResolvedInfections,
    pendingEffectivenessReviews,
    outstandingInfectionFollowUps,
  ] = await Promise.all([
    getActionableIncidents(),
    getRecentlyResolvedIncidents(),
    getActionableInfections(),
    getRecentlyResolvedInfections(),
    loadEffectivenessReviewsForCompose(),
    loadOutstandingInfectionFollowUpsForCompose(),
  ]);

  return {
    actionableIncidents,
    recentlyResolvedIncidents,
    actionableInfections,
    recentlyResolvedInfections,
    pendingEffectivenessReviews,
    outstandingInfectionFollowUps,
  };
}

export async function getTodaysWorkItems(viewerRole: AuthRole | null | undefined, now: Date = new Date()): Promise<WorkItem[]> {
  const capabilities: TodaysWorkGovernanceCapabilities = {
    canVerifyResidentEvidence: canVerifyResidentEvidence(viewerRole),
    canViewIncidentsAndInfections: canViewIncidentsAndInfections(viewerRole),
    canViewAuditReadiness: canViewAuditReadiness(viewerRole),
  };

  const [
    openFollowUps,
    completedFollowUps,
    workspaceRows,
    nearestActions,
    completedActions,
    recruiting,
    incidentsAndInfections,
    eprpEvaluation,
    openCorrectiveActions,
  ] = await Promise.all([
    getAllOpenWellnessFollowUps(),
    getRecentlyCompletedWellnessFollowUps(),
    getRelationshipWorkspaceRows(),
    getNearestOpenActionByRelationship(),
    getRecentlyCompletedActions(),
    getRecruitingLeads(),
    loadIncidentsAndInfectionsForCompose(capabilities.canViewIncidentsAndInfections),
    capabilities.canViewAuditReadiness ? getEmergencyPreparednessReadinessEvaluation() : Promise.resolve(null),
    loadCorrectiveActionsForCompose(capabilities),
  ]);

  const {
    actionableIncidents,
    recentlyResolvedIncidents,
    actionableInfections,
    recentlyResolvedInfections,
    pendingEffectivenessReviews,
    outstandingInfectionFollowUps,
  } = incidentsAndInfections;

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
      pendingEffectivenessReviews,
      outstandingInfectionFollowUps,
    },
    now,
  );
}
