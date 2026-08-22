"use server";

// Add New Client phase — Canonical Client Creation Independent of AxisCare
// Timing. Serve OS creates the canonical resident + Serve relationship
// without requiring an AxisCare record to exist first; AxisCare
// reconciliation (unmodified) resolves a later-arriving AxisCare record
// back to this same canonical person. See
// supabase/migrations/20260902340000_create_resident_manual_rpc.sql for
// the governing design.
import { revalidatePath } from "next/cache";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions, canEditResidentProfile } from "@/lib/auth/permissions";
import { listCommunities, getCommunityById } from "@/lib/data/communities";
import { isCommunityAccessAuthorized } from "@/lib/auth/communityScope";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import type { AuthRole } from "@/lib/auth/constants";
import type { Community } from "@/lib/supabase/types";
import { findPossibleExistingServePerson, type PossibleExistingServePersonMatch } from "@/lib/data/addClientDuplicateCheck";
import { createResidentManual, logResidentManuallyCreated } from "@/lib/data/residentManualCreation";
import { getResidentServeRelationshipDetail } from "@/lib/data/residentServeRelationships";
import { correctResidentServeRelationship } from "@/lib/data/residentServeRelationshipCorrections";
import { parseOptionalDateOnly } from "@/lib/relationships/validation";

async function requireAddClientActor(): Promise<{ actor: string; role: AuthRole } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to add a new client." };
  }
  return { actor: profile.full_name?.trim() || profile.email, role: profile.role };
}

// Server-side re-validation of the operator-submitted community — never a
// trusted client ID, same pattern as every other community-scoped action
// in this app (e.g. Community Roster Import's requireAuthorizedCommunity).
async function requireAuthorizedCommunity(communityId: string, role: AuthRole): Promise<{ community: Community } | { error: string }> {
  const communities = await listCommunities();
  const activeCommunityIds = new Set(communities.map((c) => c.id));
  const authorized = isCommunityAccessAuthorized({ role, communityId, activeCommunityIds });
  if (!authorized) return { error: "You are not authorized to add a client for this community." };
  const community = await getCommunityById(communityId);
  if (!community) return { error: "Select a community before adding a client." };
  return { community };
}

function revalidateAfterClientChange(residentId?: string) {
  revalidatePath("/residents");
  revalidatePath("/audit-readiness");
  if (residentId) revalidatePath(`/residents/${residentId}`);
}

// Section 1 — entry-point prefill. A single-community operator context
// (e.g. Heritage Ranch selected) prefills that community; "All
// Communities" (or an unassigned/non_community scope) requires an
// explicit choice — never a silent default to any one community.
export interface AddClientDefaultCommunity {
  readonly communityId: string | null;
  readonly requiresExplicitSelection: boolean;
}

export async function getAddClientDefaultCommunity(): Promise<AddClientDefaultCommunity> {
  const profile = await getCurrentAuthorizedUser();
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  if (filter.mode === "single") {
    return { communityId: filter.communityId, requiresExplicitSelection: false };
  }
  return { communityId: null, requiresExplicitSelection: true };
}

export interface AddClientContactInput {
  readonly communityId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone?: string;
  readonly email?: string;
  readonly dateOfBirth?: string;
  readonly unitNumber?: string;
}

export interface CheckForPossibleExistingServePersonResult {
  match?: PossibleExistingServePersonMatch | null;
  error?: string;
}

// Called from the form BEFORE final submit — the first pass of the
// duplicate check (section 3). The action layer's own create step below
// re-runs this same check immediately before insert; a client-submitted
// "no match found" is never trusted on its own.
export async function checkForPossibleExistingServePerson(
  input: AddClientContactInput
): Promise<CheckForPossibleExistingServePersonResult> {
  const actorResult = await requireAddClientActor();
  if ("error" in actorResult) return actorResult;
  if (!input.firstName.trim() || !input.lastName.trim()) return { match: null };

  const communityResult = await requireAuthorizedCommunity(input.communityId, actorResult.role);
  if ("error" in communityResult) return { error: communityResult.error };

  const dob = parseOptionalDateOnly(input.dateOfBirth);
  if (dob.error) return { error: dob.error };

  const match = await findPossibleExistingServePerson({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    dateOfBirth: dob.iso ?? null,
    communityId: communityResult.community.id,
    communityName: communityResult.community.name,
    unitNumber: input.unitNumber?.trim() || null,
  });
  return { match };
}

export interface CreateNewClientInput extends AddClientContactInput {
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zipCode?: string;
  readonly building?: string;
  readonly relationshipStatus: "active_client" | "prospect";
  // Set only when the operator already reviewed a possible-match panel
  // for THIS exact candidate and explicitly confirmed "different person"
  // (section 21) — a fresh re-check still runs; if a NEW or DIFFERENT
  // candidate now appears, creation is blocked again rather than trusting
  // the earlier acknowledgment for a candidate the operator never saw.
  readonly acknowledgedPossibleMatchResidentId?: string;
}

export interface CreateNewClientResult {
  residentId?: string;
  error?: string;
  possibleMatch?: PossibleExistingServePersonMatch | null;
}

export async function createNewClient(input: CreateNewClientInput): Promise<CreateNewClientResult> {
  const actorResult = await requireAddClientActor();
  if ("error" in actorResult) return actorResult;

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (input.relationshipStatus !== "active_client" && input.relationshipStatus !== "prospect") {
    return { error: "Select a Serve relationship (Active Client or Prospect)." };
  }

  const communityResult = await requireAuthorizedCommunity(input.communityId, actorResult.role);
  if ("error" in communityResult) return { error: communityResult.error };
  const community = communityResult.community;

  const dob = parseOptionalDateOnly(input.dateOfBirth);
  if (dob.error) return { error: dob.error };

  // Fresh duplicate re-check immediately before insert (section 3) —
  // never trusts a client-submitted "no match" state, same discipline as
  // createResidentFromAxisCareRecord/createResidentFromRosterRow.
  const freshMatch = await findPossibleExistingServePerson({
    firstName,
    lastName,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    dateOfBirth: dob.iso ?? null,
    communityId: community.id,
    communityName: community.name,
    unitNumber: input.unitNumber?.trim() || null,
  });

  if (freshMatch && freshMatch.residentId !== input.acknowledgedPossibleMatchResidentId) {
    // Either the operator hasn't reviewed a candidate yet, or a
    // DIFFERENT candidate now exists than the one they acknowledged —
    // always block on the current evidence, never the stale client state.
    return { possibleMatch: freshMatch };
  }

  const duplicateReviewNote = freshMatch
    ? `A possible existing match (${freshMatch.residentName}) was reviewed and confirmed to be a different person before creation.`
    : null;

  const createResult = await createResidentManual({
    firstName,
    lastName,
    communityId: community.id,
    communityName: community.name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    dateOfBirth: dob.iso ?? null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    zipCode: input.zipCode?.trim() || null,
    unitNumber: input.unitNumber?.trim() || null,
    building: input.building?.trim() || null,
    serveRelationshipStatus: input.relationshipStatus,
    actor: actorResult.actor,
    rationale: duplicateReviewNote,
  });
  if (createResult.error || !createResult.residentId) {
    return { error: createResult.error ?? "Could not create the new client." };
  }

  await logResidentManuallyCreated(createResult.residentId, actorResult.actor, community.name, input.relationshipStatus, duplicateReviewNote);

  revalidateAfterClientChange(createResult.residentId);
  return { residentId: createResult.residentId };
}

// "Existing Person -> New Serve Relationship" (section 20): the operator
// picked an ALREADY-EXISTING resident from the duplicate-review panel
// instead of creating a new one. Reuses the exact same governed
// correction mechanism createNewClient's own RPC uses internally — no
// second relationship-establishment path.
export async function establishRelationshipForExistingPerson(input: {
  residentId: string;
  relationshipStatus: "active_client" | "prospect";
  rationale?: string;
}): Promise<{ error?: string; success?: boolean }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canEditResidentProfile(profile.role)) {
    return { error: "You are not authorized to establish a Serve relationship." };
  }
  const actor = profile.full_name?.trim() || profile.email;

  // Every resident by id, regardless of the operator's own current
  // community scope — this is a lookup of one already-known, specific
  // person (surfaced by the duplicate check above), never a browseable
  // cross-community list.
  const detail = await getResidentServeRelationshipDetail(input.residentId, { mode: "all" });
  if (!detail) return { error: "That person could not be found." };

  const result = await correctResidentServeRelationship({
    residentId: input.residentId,
    previousValue: detail.projection.relationship,
    newValue: input.relationshipStatus,
    actor,
    rationale: input.rationale?.trim() || `Established as ${input.relationshipStatus === "active_client" ? "Active Client" : "Prospect"} via Add New Client (existing person reused).`,
  });
  if (result.error) return { error: result.error };

  revalidateAfterClientChange(input.residentId);
  return { success: true };
}
