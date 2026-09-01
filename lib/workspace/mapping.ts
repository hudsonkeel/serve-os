// Pure per-source mappers — turn a raw row from an existing data source
// into a normalized WorkItem. No I/O here; lib/data/todaysWork.ts does the
// fetching and calls these. See docs/architecture/TODAYS_WORK_CONTINUITY.md
// for the "attention should be earned" / Continuity Rule principles these
// mappers implement, especially for assessments/proposals and recruiting.
import { getCentralDayBoundaryUtc } from "../utils/date.ts";
import type { WorkItem } from "./workItem.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(earlier: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(earlier).getTime()) / MS_PER_DAY);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(iso));
}

function isOverdue(dueAt: string | null, now: Date): boolean {
  return dueAt !== null && new Date(dueAt).getTime() < getCentralDayBoundaryUtc(-1, now).getTime();
}

function isDueTodayOrEarlier(dueAt: string | null, now: Date): boolean {
  return dueAt !== null && new Date(dueAt).getTime() < getCentralDayBoundaryUtc(0, now).getTime();
}

// ─── Wellness follow-ups ─────────────────────────────────────────────────

export interface WellnessFollowUpMapperInput {
  id: string;
  residentId: string;
  residentDisplayName: string;
  title: string;
  status: "open" | "in_progress";
  dueAt: string | null;
  assignedTo: string | null;
  priority: "routine" | "monitor" | "important" | "urgent";
}

const WELLNESS_PRIORITY_TO_WORK_ITEM: Record<WellnessFollowUpMapperInput["priority"], WorkItem["priority"]> = {
  urgent: "urgent",
  important: "high",
  monitor: "normal",
  routine: "low",
};

export function mapWellnessFollowUpToWorkItem(input: WellnessFollowUpMapperInput, now: Date = new Date()): WorkItem {
  const overdue = isOverdue(input.dueAt, now);
  const dueToday = !overdue && isDueTodayOrEarlier(input.dueAt, now);

  const status = overdue ? "needs_attention" : dueToday ? "due_today" : input.status === "in_progress" ? "in_progress" : "upcoming";

  const explanation = overdue
    ? `Follow-up for ${input.residentDisplayName} was due ${formatDate(input.dueAt as string)} and remains open.`
    : dueToday
      ? `Follow-up for ${input.residentDisplayName} is due today.`
      : input.status === "in_progress"
        ? `Follow-up for ${input.residentDisplayName} is in progress.`
        : input.dueAt
          ? `Follow-up for ${input.residentDisplayName} is due ${formatDate(input.dueAt)}.`
          : `Open follow-up for ${input.residentDisplayName} with no due date set.`;

  return {
    id: `wellness_follow_up:${input.id}`,
    sourceType: "wellness_follow_up",
    title: input.title,
    status,
    evidenceType: "explicit",
    priority: WELLNESS_PRIORITY_TO_WORK_ITEM[input.priority],
    dueAt: input.dueAt ?? undefined,
    ownerId: input.assignedTo ?? undefined,
    ownerLabel: input.assignedTo ?? undefined,
    subjectType: "resident",
    subjectId: input.residentId,
    subjectLabel: input.residentDisplayName,
    sourceRoute: `/residents/${input.residentId}`,
    explanation,
  };
}

export interface CompletedWellnessFollowUpMapperInput {
  id: string;
  residentId: string;
  residentDisplayName: string;
  title: string;
  completedAt: string;
  completedBy: string | null;
}

export function mapCompletedWellnessFollowUpToWorkItem(input: CompletedWellnessFollowUpMapperInput): WorkItem {
  return {
    id: `wellness_follow_up:${input.id}`,
    sourceType: "wellness_follow_up",
    title: input.title,
    status: "completed",
    evidenceType: "explicit",
    completedAt: input.completedAt,
    ownerId: input.completedBy ?? undefined,
    ownerLabel: input.completedBy ?? undefined,
    subjectType: "resident",
    subjectId: input.residentId,
    subjectLabel: input.residentDisplayName,
    sourceRoute: `/residents/${input.residentId}`,
    explanation: `Completed ${formatDate(input.completedAt)}${input.completedBy ? ` by ${input.completedBy}` : ""}.`,
  };
}

// ─── Relationship actions ───────────────────────────────────────────────

export interface RelationshipActionMapperInput {
  id: string;
  relationshipId: string;
  relationshipDisplayName: string;
  title: string;
  dueAt: string | null;
  assignedTo: string | null;
  priority: "low" | "normal" | "high" | "urgent";
}

export function mapRelationshipActionToWorkItem(input: RelationshipActionMapperInput, now: Date = new Date()): WorkItem {
  const overdue = isOverdue(input.dueAt, now);
  const dueToday = !overdue && isDueTodayOrEarlier(input.dueAt, now);
  const status = overdue ? "needs_attention" : dueToday ? "due_today" : "upcoming";

  const explanation = overdue
    ? `Action for ${input.relationshipDisplayName} was due ${formatDate(input.dueAt as string)} and remains open.`
    : dueToday
      ? `Action for ${input.relationshipDisplayName} is due today.`
      : input.dueAt
        ? `Action for ${input.relationshipDisplayName} is due ${formatDate(input.dueAt)}.`
        : `Open action for ${input.relationshipDisplayName} with no due date set.`;

  return {
    id: `relationship_action:${input.id}`,
    sourceType: "relationship_action",
    title: input.title,
    status,
    evidenceType: "explicit",
    priority: input.priority,
    dueAt: input.dueAt ?? undefined,
    ownerId: input.assignedTo ?? undefined,
    ownerLabel: input.assignedTo ?? undefined,
    subjectType: "relationship",
    subjectId: input.relationshipId,
    subjectLabel: input.relationshipDisplayName,
    sourceRoute: `/relationships/${input.relationshipId}`,
    explanation,
  };
}

export interface CompletedRelationshipActionMapperInput {
  id: string;
  relationshipId: string;
  relationshipDisplayName: string;
  title: string;
  completedAt: string;
  completedBy: string | null;
  completionOutcome: string | null;
}

export function mapCompletedRelationshipActionToWorkItem(input: CompletedRelationshipActionMapperInput): WorkItem {
  return {
    id: `relationship_action:${input.id}`,
    sourceType: "relationship_action",
    title: input.title,
    status: "completed",
    evidenceType: "explicit",
    completedAt: input.completedAt,
    ownerId: input.completedBy ?? undefined,
    ownerLabel: input.completedBy ?? undefined,
    subjectType: "relationship",
    subjectId: input.relationshipId,
    subjectLabel: input.relationshipDisplayName,
    sourceRoute: `/relationships/${input.relationshipId}`,
    explanation: `Completed ${formatDate(input.completedAt)}${input.completionOutcome ? `: ${input.completionOutcome}` : ""}.`,
  };
}

// ─── Assessments / Proposals — Continuity-Rule-gated (see "Attention
// should be earned" in docs/architecture/TODAYS_WORK_CONTINUITY.md) ──────

// Tunable, named constants — not magic numbers. A relationship sitting in
// an assessment/proposal stage with no meaningful contact in this many
// days earns a Needs Attention item; fresher ones produce none at all.
export const ASSESSMENT_PROPOSAL_STALE_DAYS = 5;

export interface PipelineStageMapperInput {
  relationshipId: string;
  displayName: string;
  ownerLabel: string | null;
  lastMeaningfulTouchAt: string | null;
  updatedAt: string;
  kind: "assessment" | "proposal";
  nearestOpenActionDueAt?: string | null;
}

export function mapPipelineStageToWorkItem(input: PipelineStageMapperInput, now: Date = new Date()): WorkItem | null {
  const referenceTime = input.lastMeaningfulTouchAt ?? input.updatedAt;
  const daysSinceContact = daysBetween(referenceTime, now);
  if (daysSinceContact < ASSESSMENT_PROPOSAL_STALE_DAYS) return null;

  const kindLabel = input.kind === "assessment" ? "assessment" : "proposal";
  return {
    id: `${input.kind}:${input.relationshipId}`,
    sourceType: input.kind,
    title: `${input.kind === "assessment" ? "Assessment" : "Proposal"} — ${input.displayName}`,
    status: "needs_attention",
    evidenceType: "deterministic",
    dueAt: input.nearestOpenActionDueAt ?? undefined,
    ownerLabel: input.ownerLabel ?? undefined,
    subjectType: "relationship",
    subjectId: input.relationshipId,
    subjectLabel: input.displayName,
    sourceRoute: `/relationships/${input.relationshipId}`,
    explanation: `No contact logged in ${daysSinceContact} days while awaiting ${kindLabel}${kindLabel === "assessment" ? " scheduling or completion" : ""}.`,
  };
}

// ─── Recruiting — Continuity-Rule-gated ─────────────────────────────────

export const RECRUITING_LEAD_STALE_DAYS = 3;

export interface RecruitingLeadMapperInput {
  id: string;
  firstName: string | null;
  lastName: string | null;
  status: "new" | "contacted" | "in_review" | "applied" | "not_a_fit" | "hired" | "archived";
  createdAt: string;
}

export function mapRecruitingLeadToWorkItem(input: RecruitingLeadMapperInput, now: Date = new Date()): WorkItem | null {
  if (input.status !== "new" && input.status !== "in_review") return null;

  const daysSinceArrival = daysBetween(input.createdAt, now);
  if (daysSinceArrival < RECRUITING_LEAD_STALE_DAYS) return null;

  const name = [input.firstName, input.lastName].filter(Boolean).join(" ") || "Recruiting lead";
  return {
    id: `recruiting:${input.id}`,
    sourceType: "recruiting",
    title: name,
    status: "needs_attention",
    evidenceType: "deterministic",
    subjectType: "candidate",
    subjectId: input.id,
    subjectLabel: name,
    sourceRoute: `/recruiting/${input.id}`,
    explanation: `No contact logged in ${daysSinceArrival} days since this lead arrived.`,
  };
}

// ─── Waiting On (on-hold relationships) ──────────────────────────────────

export interface OnHoldRelationshipMapperInput {
  relationshipId: string;
  displayName: string;
  ownerLabel: string | null;
}

export function mapOnHoldRelationshipToWorkItem(input: OnHoldRelationshipMapperInput): WorkItem {
  return {
    id: `relationship_on_hold:${input.relationshipId}`,
    sourceType: "other",
    title: input.displayName,
    status: "waiting",
    evidenceType: "explicit",
    ownerLabel: input.ownerLabel ?? undefined,
    subjectType: "relationship",
    subjectId: input.relationshipId,
    subjectLabel: input.displayName,
    sourceRoute: `/relationships/${input.relationshipId}`,
    explanation: "Relationship is on hold.",
  };
}

// ─── No next action (reuses lib/relationships/attention.ts's existing,
// already-deterministic "no_next_action" bucket verbatim — this is not a
// new rule, just a new consumer of one that already exists) ─────────────

export interface NoNextActionMapperInput {
  relationshipId: string;
  displayName: string;
  ownerLabel: string | null;
}

export function mapNoNextActionToWorkItem(input: NoNextActionMapperInput): WorkItem {
  return {
    id: `relationship_no_next_action:${input.relationshipId}`,
    sourceType: "other",
    title: input.displayName,
    status: "needs_attention",
    evidenceType: "deterministic",
    ownerLabel: input.ownerLabel ?? undefined,
    subjectType: "relationship",
    subjectId: input.relationshipId,
    subjectLabel: input.displayName,
    sourceRoute: `/relationships/${input.relationshipId}`,
    recommendedNextStep: "Add a next action for this relationship.",
    explanation: "Relationship is active but has no documented next step.",
  };
}

// ─── Incidents / Infections (Governance Connective Slice v0.1) ──────────
//
// Neither register has a due-date column at all (unlike wellness
// follow-ups/relationship actions) — bucketing comes from
// status/review_status/follow_up_required, not date math. dueAt is
// deliberately left undefined rather than invented from occurred_at/
// disclosed_at, which describe when the event happened, not when
// follow-up work is due. priority is likewise left undefined for v0.1:
// neither table carries a severity field to derive one from without
// fabricating a judgment the record doesn't actually make (injury_occurred
// on Incidents is a plausible future signal, deliberately not used here).
// See docs/architecture/TODAYS_WORK_CONTINUITY.md's normalization contract
// and the Slice One build plan's §3B.

export interface IncidentWorkItemMapperInput {
  id: string;
  typeLabel: string;
  reviewStatus: "not_reviewed" | "reviewed";
  followUpRequired: boolean;
  owner: string | null;
  occurredAtLabel: string;
  residentId: string | null;
  residentDisplayName: string | null;
}

export function mapIncidentToWorkItem(input: IncidentWorkItemMapperInput): WorkItem {
  const status = input.reviewStatus === "not_reviewed" ? "needs_attention" : "in_progress";
  const explanation =
    input.reviewStatus === "not_reviewed"
      ? `Incident (${input.typeLabel}) recorded ${input.occurredAtLabel} has not been reviewed.`
      : `Incident (${input.typeLabel}) is reviewed and awaiting follow-up${input.owner ? ` (owner: ${input.owner})` : ""}.`;

  return {
    id: `incident:${input.id}`,
    sourceType: "incident",
    title: `Incident — ${input.typeLabel}`,
    status,
    evidenceType: "explicit",
    ownerId: input.owner ?? undefined,
    ownerLabel: input.owner ?? undefined,
    subjectType: input.residentId ? "resident" : undefined,
    subjectId: input.residentId ?? undefined,
    subjectLabel: input.residentDisplayName ?? undefined,
    sourceRoute: `/qapi/incidents/${input.id}`,
    explanation,
  };
}

export interface CompletedIncidentWorkItemMapperInput {
  id: string;
  typeLabel: string;
  resolvedAt: string;
  resolvedBy: string | null;
}

export function mapCompletedIncidentToWorkItem(input: CompletedIncidentWorkItemMapperInput): WorkItem {
  return {
    id: `incident:${input.id}`,
    sourceType: "incident",
    title: `Incident — ${input.typeLabel}`,
    status: "completed",
    evidenceType: "explicit",
    completedAt: input.resolvedAt,
    ownerId: input.resolvedBy ?? undefined,
    ownerLabel: input.resolvedBy ?? undefined,
    sourceRoute: `/qapi/incidents/${input.id}`,
    explanation: `Resolved${input.resolvedBy ? ` by ${input.resolvedBy}` : ""}.`,
  };
}

export interface InfectionWorkItemMapperInput {
  id: string;
  reviewStatus: "not_reviewed" | "reviewed";
  followUpRequired: boolean;
  owner: string | null;
  disclosedAtLabel: string;
  residentId: string;
  residentDisplayName: string | null;
}

export function mapInfectionToWorkItem(input: InfectionWorkItemMapperInput): WorkItem {
  const status = input.reviewStatus === "not_reviewed" ? "needs_attention" : "in_progress";
  const explanation =
    input.reviewStatus === "not_reviewed"
      ? `Infection record disclosed ${input.disclosedAtLabel} has not been reviewed.`
      : `Infection record is reviewed and awaiting follow-up${input.owner ? ` (owner: ${input.owner})` : ""}.`;

  return {
    id: `infection:${input.id}`,
    sourceType: "infection",
    title: input.residentDisplayName ? `Infection — ${input.residentDisplayName}` : "Infection record",
    status,
    evidenceType: "explicit",
    ownerId: input.owner ?? undefined,
    ownerLabel: input.owner ?? undefined,
    subjectType: "resident",
    subjectId: input.residentId,
    subjectLabel: input.residentDisplayName ?? undefined,
    sourceRoute: `/qapi/infections/${input.id}`,
    explanation,
  };
}

export interface CompletedInfectionWorkItemMapperInput {
  id: string;
  residentDisplayName: string | null;
  resolvedAt: string;
  resolvedBy: string | null;
}

export function mapCompletedInfectionToWorkItem(input: CompletedInfectionWorkItemMapperInput): WorkItem {
  return {
    id: `infection:${input.id}`,
    sourceType: "infection",
    title: input.residentDisplayName ? `Infection — ${input.residentDisplayName}` : "Infection record",
    status: "completed",
    evidenceType: "explicit",
    completedAt: input.resolvedAt,
    ownerId: input.resolvedBy ?? undefined,
    ownerLabel: input.resolvedBy ?? undefined,
    sourceRoute: `/qapi/infections/${input.id}`,
    explanation: `Resolved${input.resolvedBy ? ` by ${input.resolvedBy}` : ""}.`,
  };
}

// ─── Emergency Preparedness due/overdue requirements (Governance
// Connective Slice v0.1) ──────────────────────────────────────────────────
//
// Deliberately reuses the shared requirement evaluator's own output
// (status + explanation) rather than recomputing due-state — Today's Work
// must never become a second, potentially-diverging source of "due" truth.
// No new persisted Obligation row: this mapper is called against a fresh
// evaluation on every Today's Work read (see lib/data/todaysWork.ts), so a
// requirement that becomes satisfied simply stops producing an item on the
// next read — nothing to clean up.

export interface EmergencyPreparednessObligationMapperInput {
  requirementId: string;
  requirementName: string;
  status: "due_soon" | "overdue" | "missing_evidence";
  explanation: string;
  expirationDate: string | null;
}

export function mapEmergencyPreparednessObligationToWorkItem(input: EmergencyPreparednessObligationMapperInput): WorkItem {
  const status = input.status === "due_soon" ? "upcoming" : "needs_attention";

  return {
    id: `compliance_requirement:${input.requirementId}`,
    sourceType: "compliance_requirement",
    title: `Emergency Preparedness — ${input.requirementName}`,
    status,
    evidenceType: "deterministic",
    dueAt: input.expirationDate ?? undefined,
    sourceRoute: "/audit-readiness/emergency-preparedness",
    explanation: input.explanation,
  };
}
