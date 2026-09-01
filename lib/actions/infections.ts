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
} from "../data/infections.ts";
import { recordComplianceActivityForSource, resolveGovernanceActivitySubject } from "../data/complianceActivity.ts";
import { syncCorrectiveAction } from "../data/complianceCorrectiveActions.ts";
import type { AuthorizedProfile } from "../auth/profiles.ts";
import type { ComplianceCorrectiveAction, ComplianceCorrectiveActionPriority, Infection } from "../supabase/types.ts";

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

// Governance Connective Slice v0.1 — mirrors createIncidentCorrectiveActionAction
// in lib/actions/incidents.ts exactly. Deliberate, human-confirmed, never
// automatic on follow_up_required=true alone.
export interface CreateInfectionCorrectiveActionInput {
  infectionId: string;
  title: string;
  reason: string;
  priority: ComplianceCorrectiveActionPriority;
  dueAt: string | null;
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
  if (!infection.follow_up_required) return { error: "This infection record was not marked as requiring follow-up." };

  const subject = resolveGovernanceActivitySubject(infection.resident_id, infection.community_id);
  if (!subject) return { error: "This infection record has no client or community context to attach a corrective action to." };

  return syncCorrectiveAction({
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    requirementId: null,
    domain: "infections",
    actionType: "infection_follow_up_required",
    title: input.title,
    reason: input.reason,
    priority: input.priority,
    dueAt: input.dueAt,
    actor: actor.label,
    sourceInfectionId: infection.id,
  });
}
