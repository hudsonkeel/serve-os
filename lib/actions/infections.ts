"use server";

// Server-action layer for infections — mirrors lib/actions/incidents.ts
// exactly. An infection is always resident-linked (schema-enforced), so
// there is no "no resident" community fallback branch here.
import { getCurrentAuthorizedUser } from "../auth/session.ts";
import { resolveCurrentCommunityQueryFilter } from "../auth/currentCommunity.ts";
import {
  canCreateIncidentOrInfection,
  canReviewIncidentOrInfection,
  canResolveIncidentOrInfection,
  canViewIncidentsAndInfections,
  canManageCorrectiveActions,
} from "../compliance/permissions.ts";
import { getResidentById } from "../data/residents.ts";
import {
  createInfection,
  getInfectionById,
  listInfections,
  markInfectionReviewed,
  resolveInfection,
  scheduleInfectionFollowUp,
} from "../data/infections.ts";
import { recordInfectionFollowUp } from "../data/infectionFollowUps.ts";
import { recordComplianceActivityForSource, resolveGovernanceActivitySubject } from "../data/complianceActivity.ts";
import { createInfectionCorrectiveAction } from "../data/complianceCorrectiveActions.ts";
import type { AuthorizedProfile } from "../auth/profiles.ts";
import type {
  ComplianceCorrectiveAction,
  ComplianceCorrectiveActionPriority,
  Infection,
  InfectionFollowUp,
  InfectionFollowUpInformationSource,
  InfectionFollowUpPurpose,
  InfectionFollowUpReportedStatus,
  InfectionFollowUpServiceImpact,
} from "../supabase/types.ts";

// Governance Connective Slice v0.1 — mirrors emitIncidentActivity in
// lib/actions/incidents.ts exactly. Infections are always resident-linked
// (schema-enforced), so this always resolves subject_type='resident' in
// practice — resolveGovernanceActivitySubject is still reused rather than
// hand-rolling that fact, so both registers share one source of truth for
// the subject-resolution rule.
async function emitInfectionActivity(
  infection: Infection,
  eventType: "infection_created" | "infection_reviewed" | "infection_resolved",
  eventTitle: string,
  actor: string
): Promise<void> {
  const subject = resolveGovernanceActivitySubject(infection.resident_id, infection.community_id);
  if (!subject) return;

  await recordComplianceActivityForSource({
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    eventType,
    eventTitle,
    eventDescription: null,
    source: "Serve OS",
    sourceType: "infection",
    sourceRecordId: infection.id,
    createdBy: actor,
  });
}

async function currentActor(): Promise<{ label: string; profile: AuthorizedProfile } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, profile };
}

// Never trusts a caller-supplied community_id — always derived from the
// linked resident's own canonical community_id, so the record stays
// historically scoped to the community at the time of creation. Fails
// safely (an explicit error, not a silent null-community insert) if the
// resident doesn't exist.
async function resolveCommunityIdForInfection(residentId: string): Promise<{ communityId: string | null } | { error: string }> {
  const resident = await getResidentById(residentId);
  if (!resident) return { error: "Selected client not found." };
  return { communityId: resident.community_id };
}

export async function listInfectionsAction(): Promise<{ infections?: Infection[]; error?: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in to view infection records." };
  if (!canViewIncidentsAndInfections(profile.role)) {
    return { error: "You do not have permission to view infection records." };
  }

  const filter = await resolveCurrentCommunityQueryFilter(profile);
  const infections = await listInfections(filter);
  return { infections };
}

export async function getInfectionAction(id: string): Promise<{ infection?: Infection; error?: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in to view infection records." };
  if (!canViewIncidentsAndInfections(profile.role)) {
    return { error: "You do not have permission to view infection records." };
  }

  const infection = await getInfectionById(id);
  if (!infection) return { error: "Infection record not found." };

  const filter = await resolveCurrentCommunityQueryFilter(profile);
  if (filter.mode === "none") return { error: "Infection record not found." };
  if (filter.mode === "single" && infection.community_id !== filter.communityId) {
    return { error: "Infection record not found." };
  }

  return { infection };
}

export interface CreateInfectionActionInput {
  residentId: string;
  disclosedAt: string;
  conditionDescription: string;
  treatmentDescription: string | null;
  disclosedBy: string | null;
  followUpRequired: boolean;
  owner: string | null;
  notes: string | null;
}

export async function createInfectionAction(input: CreateInfectionActionInput): Promise<{ infection?: Infection; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to create an infection record." };
  if (!canCreateIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to create an infection record." };
  }

  const communityResult = await resolveCommunityIdForInfection(input.residentId);
  if ("error" in communityResult) return communityResult;

  const result = await createInfection({
    communityId: communityResult.communityId,
    residentId: input.residentId,
    disclosedAt: input.disclosedAt,
    conditionDescription: input.conditionDescription,
    treatmentDescription: input.treatmentDescription,
    disclosedBy: input.disclosedBy,
    followUpRequired: input.followUpRequired,
    owner: input.owner,
    notes: input.notes,
    actor: actor.label,
  });

  if (result.infection) {
    await emitInfectionActivity(result.infection, "infection_created", "Infection recorded", actor.label);
  }

  return result;
}

export async function markInfectionReviewedAction(input: {
  infectionId: string;
  followUpRequired: boolean;
  owner: string | null;
  // Only ever actually written on the infection's first review, or as a
  // one-time legacy backfill when it was reviewed before this field
  // existed and still reads null (Linda Kaplan's real record) — see
  // mark_infection_reviewed's own freeze-after-first-write discipline.
  reviewFindings?: string | null;
}): Promise<{ infection?: Infection; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to review an infection record." };
  if (!canReviewIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to review an infection record." };
  }

  const result = await markInfectionReviewed({
    infectionId: input.infectionId,
    followUpRequired: input.followUpRequired,
    owner: input.owner,
    reviewFindings: input.reviewFindings,
    actor: actor.label,
  });

  if (result.infection) {
    await emitInfectionActivity(result.infection, "infection_reviewed", "Infection record reviewed", actor.label);
  }

  return result;
}

export async function resolveInfectionAction(input: {
  infectionId: string;
  resolutionNote: string;
}): Promise<{ infection?: Infection; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to resolve an infection record." };
  if (!canResolveIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to resolve an infection record." };
  }

  const result = await resolveInfection({
    infectionId: input.infectionId,
    resolutionNote: input.resolutionNote,
    actor: actor.label,
  });

  if (result.infection) {
    await emitInfectionActivity(result.infection, "infection_resolved", "Infection record resolved", actor.label);
  }

  return result;
}

// Infection Lifecycle & Learning Loop v0.1 — replaces the old single-shot
// sync/upsert path with a plain-insert RPC, mirroring
// createIncidentCorrectiveActionAction in lib/actions/incidents.ts
// structurally. Deliberately NOT gated on follow_up_required — an
// independent Serve process/infection-control/service-delivery concern can
// be identified whether or not the client's own follow-up loop is open
// (see the revised product direction's approved decision: no separate
// stored "concern identified" flag; the corrective action's existence is
// itself the signal). Still gated on the infection being open — no
// corrective action work starts against an already-closed record.
export interface CreateInfectionCorrectiveActionInput {
  infectionId: string;
  title: string;
  finding: string;
  actionPlan: string;
  owner: string | null;
  priority: ComplianceCorrectiveActionPriority;
  dueAt: string | null;
  effectivenessReviewRequired: boolean;
  effectivenessReviewDueAt: string | null;
  effectivenessReviewOwner: string | null;
  effectivenessSuccessCriteria: string | null;
}

export async function createInfectionCorrectiveActionAction(
  input: CreateInfectionCorrectiveActionInput
): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to create a corrective action." };
  if (!canManageCorrectiveActions(actor.profile.role)) {
    return { error: "You do not have permission to create a corrective action." };
  }

  const infection = await getInfectionById(input.infectionId);
  if (!infection) return { error: "Infection record not found." };
  if (infection.status !== "open") return { error: "This infection record is already resolved." };

  const subject = resolveGovernanceActivitySubject(infection.resident_id, infection.community_id);
  if (!subject) return { error: "This infection record has no client or community context to attach a corrective action to." };

  return createInfectionCorrectiveAction({
    infectionId: infection.id,
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    title: input.title,
    finding: input.finding,
    actionPlan: input.actionPlan,
    owner: input.owner,
    priority: input.priority,
    dueAt: input.dueAt,
    effectivenessReviewRequired: input.effectivenessReviewRequired,
    effectivenessReviewDueAt: input.effectivenessReviewDueAt,
    effectivenessReviewOwner: input.effectivenessReviewOwner,
    effectivenessSuccessCriteria: input.effectivenessSuccessCriteria,
    actor: actor.label,
  });
}

// Infection Lifecycle & Learning Loop v0.1 — lightweight scheduling path,
// used right after review when follow-up is needed but there is nothing
// yet to report/observe. Same trust tier as review/resolve
// (canReviewIncidentOrInfection) — establishing or revising a follow-up
// obligation is review-level judgment, not a corrective action.
export async function scheduleInfectionFollowUpAction(input: {
  infectionId: string;
  nextFollowUpDate: string;
  purpose: InfectionFollowUpPurpose;
  purposeNote: string | null;
}): Promise<{ infection?: Infection; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to schedule an infection follow-up." };
  if (!canReviewIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to schedule an infection follow-up." };
  }

  return scheduleInfectionFollowUp({
    infectionId: input.infectionId,
    nextFollowUpDate: input.nextFollowUpDate,
    purpose: input.purpose,
    purposeNote: input.purposeNote,
    actor: actor.label,
  });
}

// Infection Lifecycle & Learning Loop v0.1 — the real observation entry.
// Same trust tier as scheduling above; recording what was reported/
// observed and deciding whether another follow-up is needed is the same
// review-level judgment, not a corrective-action-management action.
export async function recordInfectionFollowUpAction(input: {
  infectionId: string;
  reportedStatus: InfectionFollowUpReportedStatus;
  serviceImpact: InfectionFollowUpServiceImpact;
  serveResponse: string[];
  narrativeNote: string | null;
  informationSource: InfectionFollowUpInformationSource;
  additionalFollowUpRequired: boolean;
  nextFollowUpDate: string | null;
  nextFollowUpPurpose: InfectionFollowUpPurpose | null;
  nextFollowUpPurposeNote: string | null;
}): Promise<{ followUp?: InfectionFollowUp; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record an infection follow-up." };
  if (!canReviewIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to record an infection follow-up." };
  }

  return recordInfectionFollowUp({
    infectionId: input.infectionId,
    reportedStatus: input.reportedStatus,
    serviceImpact: input.serviceImpact,
    serveResponse: input.serveResponse,
    narrativeNote: input.narrativeNote,
    informationSource: input.informationSource,
    additionalFollowUpRequired: input.additionalFollowUpRequired,
    nextFollowUpDate: input.nextFollowUpDate,
    nextFollowUpPurpose: input.nextFollowUpPurpose,
    nextFollowUpPurposeNote: input.nextFollowUpPurposeNote,
    actor: actor.label,
  });
}
