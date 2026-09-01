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
  canManageCorrectiveActions,
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
import { recordComplianceActivityForSource, resolveGovernanceActivitySubject } from "../data/complianceActivity.ts";
import { syncCorrectiveAction } from "../data/complianceCorrectiveActions.ts";
import type { AuthorizedProfile } from "../auth/profiles.ts";
import type { ComplianceCorrectiveAction, ComplianceCorrectiveActionPriority, Incident, IncidentType } from "../supabase/types.ts";

// Governance Connective Slice v0.1 — best-effort, non-fatal lifecycle
// event emission. The canonical incidents row is already written by the
// time this runs; a failure here is logged and swallowed, never surfaced
// to the caller or used to roll back the write it describes.
// compliance_activity_source_record_idx makes this safe to call more than
// once for the same incident+event (see recordComplianceActivityForSource).
async function emitIncidentActivity(
  incident: Incident,
  eventType: "incident_created" | "incident_reviewed" | "incident_resolved",
  eventTitle: string,
  actor: string
): Promise<void> {
  const subject = resolveGovernanceActivitySubject(incident.resident_id, incident.community_id);
  if (!subject) return; // No resident and no community context — documented v0.1 limitation, not an error.

  await recordComplianceActivityForSource({
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    eventType,
    eventTitle,
    eventDescription: null,
    source: "Serve OS",
    sourceType: "incident",
    sourceRecordId: incident.id,
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

  const result = await createIncident({
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

  if (result.incident) {
    await emitIncidentActivity(result.incident, "incident_created", "Incident recorded", actor.label);
  }

  return result;
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

  const result = await markIncidentReviewed({
    incidentId: input.incidentId,
    followUpRequired: input.followUpRequired,
    owner: input.owner,
    actor: actor.label,
  });

  // mark_incident_reviewed is itself idempotent (a re-affirmation updates
  // follow_up_required/owner without moving reviewed_at), so this can be
  // called on every success without risk of a duplicate event —
  // compliance_activity_source_record_idx absorbs the repeat.
  if (result.incident) {
    await emitIncidentActivity(result.incident, "incident_reviewed", "Incident reviewed", actor.label);
  }

  return result;
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

  const result = await resolveIncident({
    incidentId: input.incidentId,
    resolutionNote: input.resolutionNote,
    actor: actor.label,
  });

  if (result.incident) {
    await emitIncidentActivity(result.incident, "incident_resolved", "Incident resolved", actor.label);
  }

  return result;
}

// Governance Connective Slice v0.1 — a deliberate, human-confirmed step,
// never automatic on follow_up_required=true alone (see the build plan's
// explicit non-goal). The reviewer decides real tracked corrective work is
// warranted; title/reason are prefilled from the incident's own fields by
// the caller so nothing already known is re-typed. Gated on
// canManageCorrectiveActions — the same trust tier already reused by
// canReviewIncidentOrInfection/canResolveIncidentOrInfection, applied here
// under its own name since this action literally manages a corrective
// action, not just the incident record.
export interface CreateIncidentCorrectiveActionInput {
  incidentId: string;
  title: string;
  reason: string;
  priority: ComplianceCorrectiveActionPriority;
  dueAt: string | null;
}

export async function createIncidentCorrectiveActionAction(
  input: CreateIncidentCorrectiveActionInput
): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to create a corrective action." };
  if (!canManageCorrectiveActions(actor.profile.role)) {
    return { error: "You do not have permission to create a corrective action." };
  }

  const incident = await getIncidentById(input.incidentId);
  if (!incident) return { error: "Incident not found." };
  if (incident.status !== "open") return { error: "This incident is already resolved." };
  if (!incident.follow_up_required) return { error: "This incident was not marked as requiring follow-up." };

  const subject = resolveGovernanceActivitySubject(incident.resident_id, incident.community_id);
  if (!subject) return { error: "This incident has no client or community context to attach a corrective action to." };

  return syncCorrectiveAction({
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    requirementId: null,
    domain: "incidents",
    actionType: "incident_follow_up_required",
    title: input.title,
    reason: input.reason,
    priority: input.priority,
    dueAt: input.dueAt,
    actor: actor.label,
    sourceIncidentId: incident.id,
  });
}
