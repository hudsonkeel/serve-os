"use server";

// Server-action layer for incidents — the only layer permitted to call
// lib/data/incidents.ts with a real `actor` string, and the only layer
// that authorizes a request. Follows lib/actions/auditReadiness.ts's exact
// shape: a private currentActor() helper, a canX(role) gate before every
// data-layer call, and never trusting a client-supplied actor/community
// identity.
import { getCurrentAuthorizedUser } from "../auth/session.ts";
import { resolveCurrentCommunity, resolveCurrentCommunityQueryFilter } from "../auth/currentCommunity.ts";
import {
  canCreateIncidentOrInfection,
  canReviewIncidentOrInfection,
  canResolveIncidentOrInfection,
  canViewIncidentsAndInfections,
} from "../compliance/permissions.ts";
import { getResidentById } from "../data/residents.ts";
import { getWorkforceMemberById } from "../data/workforceMembers.ts";
import {
  createIncident,
  getIncidentById,
  listIncidents,
  markIncidentReviewed,
  resolveIncident,
} from "../data/incidents.ts";
import type { AuthorizedProfile } from "../auth/profiles.ts";
import type { Incident, IncidentType } from "../supabase/types.ts";

async function currentActor(): Promise<{ label: string; profile: AuthorizedProfile } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, profile };
}

// The one place community_id gets decided for a write — never trusts a
// caller-supplied value (there is no communityId field on any input type
// below). Resident-linked: derived from the resident's own canonical
// community_id, so the record stays historically scoped to the community
// at the time of creation even if the resident's association changes
// later. No resident linked: falls back to the acting user's current
// single-community context, if any — never invented, per explicit product
// decision.
async function resolveCommunityIdForIncident(
  residentId: string | null,
  profile: AuthorizedProfile
): Promise<{ communityId: string | null } | { error: string }> {
  if (residentId) {
    const resident = await getResidentById(residentId);
    if (!resident) return { error: "Selected client not found." };
    return { communityId: resident.community_id };
  }

  const context = await resolveCurrentCommunity(profile);
  if (context && context.scope.mode === "single_community") {
    return { communityId: context.scope.communityId };
  }
  return { communityId: null };
}

export async function listIncidentsAction(): Promise<{ incidents?: Incident[]; error?: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in to view incidents." };
  if (!canViewIncidentsAndInfections(profile.role)) {
    return { error: "You do not have permission to view incidents." };
  }

  const filter = await resolveCurrentCommunityQueryFilter(profile);
  const incidents = await listIncidents(filter);
  return { incidents };
}

export async function getIncidentAction(id: string): Promise<{ incident?: Incident; error?: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in to view incidents." };
  if (!canViewIncidentsAndInfections(profile.role)) {
    return { error: "You do not have permission to view incidents." };
  }

  const incident = await getIncidentById(id);
  if (!incident) return { error: "Incident not found." };

  // Same scope discipline as getCommunityResidentById: a record outside
  // the viewer's current single-community context reads as not found,
  // never as a silently-narrower error.
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  if (filter.mode === "none") return { error: "Incident not found." };
  if (filter.mode === "single" && incident.community_id !== filter.communityId) {
    return { error: "Incident not found." };
  }

  return { incident };
}

export interface CreateIncidentActionInput {
  residentId: string | null;
  workforceMemberId: string | null;
  occurredAt: string;
  location: string | null;
  incidentType: IncidentType;
  incidentTypeOther: string | null;
  description: string;
  immediateResponse: string | null;
  injuryOccurred: boolean;
  injuryMedicalDetails: string | null;
  partiesNotified: string[];
  followUpRequired: boolean;
  owner: string | null;
  notes: string | null;
}

export async function createIncidentAction(input: CreateIncidentActionInput): Promise<{ incident?: Incident; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to create an incident." };
  if (!canCreateIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to create an incident." };
  }

  if (input.residentId) {
    const resident = await getResidentById(input.residentId);
    if (!resident) return { error: "Selected client not found." };
  }
  if (input.workforceMemberId) {
    const member = await getWorkforceMemberById(input.workforceMemberId);
    if (!member) return { error: "Selected staff member not found." };
  }

  const communityResult = await resolveCommunityIdForIncident(input.residentId, actor.profile);
  if ("error" in communityResult) return communityResult;

  return createIncident({
    communityId: communityResult.communityId,
    residentId: input.residentId,
    workforceMemberId: input.workforceMemberId,
    occurredAt: input.occurredAt,
    location: input.location,
    incidentType: input.incidentType,
    incidentTypeOther: input.incidentTypeOther,
    description: input.description,
    immediateResponse: input.immediateResponse,
    injuryOccurred: input.injuryOccurred,
    injuryMedicalDetails: input.injuryMedicalDetails,
    partiesNotified: input.partiesNotified,
    followUpRequired: input.followUpRequired,
    owner: input.owner,
    notes: input.notes,
    actor: actor.label,
  });
}

export async function markIncidentReviewedAction(input: {
  incidentId: string;
  followUpRequired: boolean;
  owner: string | null;
}): Promise<{ incident?: Incident; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to review an incident." };
  if (!canReviewIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to review an incident." };
  }

  return markIncidentReviewed({
    incidentId: input.incidentId,
    followUpRequired: input.followUpRequired,
    owner: input.owner,
    actor: actor.label,
  });
}

export async function resolveIncidentAction(input: {
  incidentId: string;
  resolutionNote: string;
}): Promise<{ incident?: Incident; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to resolve an incident." };
  if (!canResolveIncidentOrInfection(actor.profile.role)) {
    return { error: "You do not have permission to resolve an incident." };
  }

  return resolveIncident({
    incidentId: input.incidentId,
    resolutionNote: input.resolutionNote,
    actor: actor.label,
  });
}
