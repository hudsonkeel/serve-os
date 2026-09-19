"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { getResidentById } from "@/lib/data/residents";
import { getApprovedFactsForResident } from "@/lib/data/assessmentIntelligence";
import {
  getContactById,
  getContactRolesForResident,
  getAssessmentSourcedRoleReferencesForResident,
  getAllContactsForMatching,
  createContact,
  setContactFieldIfEmpty,
  recordContactFieldProvenance,
  insertContactRole,
} from "@/lib/data/contacts";
import {
  buildImportantPeopleProposals,
  type ApprovedFactForProposal,
  type ProposedImportantPerson,
  type UnattachedPoaClaim,
} from "@/lib/contacts/importantPeopleProposals";
import { evaluateContactLinkForProposal, type ContactLinkDecision } from "@/lib/contacts/importantPeopleLinking";
import { partitionProposalsByResolution, computeMissingRoleInserts } from "@/lib/contacts/importantPeopleResolution";
import { normalizeContactPhone } from "@/lib/contacts/normalization";
import { ASSESSMENT_DERIVED_ROLE_STATUS } from "@/lib/contacts/roleTypes";
import type { AssertionState } from "@/lib/assessmentIntelligence/factTypes";

// Slice C.3 — assessment -> canonical Important People projection. Server actions only; no
// direct authenticated-browser write path to the contact tables exists (same governed,
// service-role-only posture as C.2's own tables and every other governed table in this repo —
// see lib/data/contacts.ts's own header comment).
//
// ASSESSMENT BOUNDARY: this file only ever READS from assessment_approved_facts (via the
// existing, unmodified getApprovedFactsForResident()) — it never writes to
// assessment_draft_facts, assessment_approved_facts, or the immutable assessment_document
// snapshot, and never calls approve_assessment_session() or anything in
// lib/actions/assessmentIntelligence.ts. Canonicalizing an Important Person is a strictly later,
// separate, human-confirmed action over an assessment's already-approved, already-frozen
// knowledge — it can never rewrite what was approved or when.
//
// SCOPE NOTE: proposals whose identity match tier is "requires_reconciliation" (an ambiguous or
// conflicting match against an existing contact) are surfaced for visibility but have NO confirm
// action wired up in this slice — building the full "pick which existing contact, or none, and
// record a suppression for the ones you reject" reconciliation UI is real, additional scope
// deliberately deferred past this narrow first cut (see the Slice C.3 investigation's own
// "smallest useful path" framing). Only the two genuinely low-friction cases — no conflict
// (create) and an exact strong match (link) — have a one-click action here.

async function requireActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };
  if (!canEditResidentProfile(profile.role)) {
    return { error: "You do not have permission to manage Important People." };
  }
  return { actor: profile.full_name || profile.email };
}

export interface ImportantPersonProposalView {
  readonly proposalKey: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly rawFullName: string;
  readonly phone: string | null;
  readonly roles: readonly { roleType: string; sourceApprovedFactId: string }[];
  readonly linkDecision: ContactLinkDecision;
  readonly nameSourceApprovedFactId: string;
  readonly phoneSourceApprovedFactId: string | null;
}

export interface CurrentImportantPersonView {
  readonly contactId: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly phone: string | null;
  readonly roles: readonly { roleType: string; status: string }[];
}

export interface ImportantPeopleReviewData {
  readonly proposals: readonly ImportantPersonProposalView[];
  readonly currentPeople: readonly CurrentImportantPersonView[];
  readonly unattachedPoaClaims: readonly UnattachedPoaClaim[];
}

function toProposalView(proposal: ProposedImportantPerson, linkDecision: ContactLinkDecision): ImportantPersonProposalView {
  return {
    proposalKey: proposal.proposalKey,
    firstName: proposal.firstName,
    lastName: proposal.lastName,
    rawFullName: proposal.rawFullName,
    phone: proposal.phone,
    roles: proposal.roles.map((r) => ({ roleType: r.roleType, sourceApprovedFactId: r.sourceApprovedFactId })),
    linkDecision,
    nameSourceApprovedFactId: proposal.nameSourceApprovedFactId,
    phoneSourceApprovedFactId: proposal.phoneSourceApprovedFactId,
  };
}

export async function getImportantPeopleReviewData(residentId: string): Promise<ImportantPeopleReviewData | null> {
  const resident = await getResidentById(residentId);
  if (!resident) return null;

  const approvedFactRows = await getApprovedFactsForResident(residentId);
  const facts: ApprovedFactForProposal[] = approvedFactRows.map((f) => ({
    id: f.id,
    fieldPath: f.field_path,
    value: f.value,
    assertionState: f.assertion_state as AssertionState,
  }));

  const { people, unattachedPoaClaims } = buildImportantPeopleProposals(facts);

  const existingReferences = await getAssessmentSourcedRoleReferencesForResident(residentId);
  const { unresolved } = partitionProposalsByResolution(people, existingReferences);

  // v0.1 simplicity: suppression is checked against an empty set here — no UI in this slice
  // writes a new contact_identity_suppressions row yet (see this file's own header comment on
  // the deferred full reconciliation flow), so there is nothing to look up in production today.
  // The read path already threads a real suppression set through to
  // evaluateContactLinkForProposal() structurally, so wiring an actual writer later needs no
  // change here.
  const allContacts = unresolved.length > 0 ? await getAllContactsForMatching() : [];
  const proposals = unresolved.map((proposal) =>
    toProposalView(
      proposal,
      evaluateContactLinkForProposal(
        { firstName: proposal.firstName, lastName: proposal.lastName, normalizedEmail: null, normalizedPhone: proposal.normalizedPhone },
        allContacts,
        new Set()
      )
    )
  );

  const existingRoleRows = await getContactRolesForResident(residentId);
  const byContact = new Map<string, CurrentImportantPersonView>();
  for (const row of existingRoleRows) {
    const existing = byContact.get(row.contact_id);
    const roleEntry = { roleType: row.role_type, status: row.status };
    if (existing) {
      (existing.roles as { roleType: string; status: string }[]).push(roleEntry);
    } else {
      byContact.set(row.contact_id, {
        contactId: row.contact_id,
        firstName: row.contact.first_name,
        lastName: row.contact.last_name,
        phone: row.contact.phone,
        roles: [roleEntry],
      });
    }
  }

  return { proposals, currentPeople: [...byContact.values()], unattachedPoaClaims };
}

export interface ConfirmImportantPersonInput {
  residentId: string;
  decision: { type: "create_new" } | { type: "link_existing"; contactId: string };
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  nameSourceApprovedFactId: string;
  phoneSourceApprovedFactId: string | null;
  roles: readonly { roleType: string; sourceApprovedFactId: string }[];
}

/** The one write action this slice adds. Idempotent: a repeated call for the exact same proposal
 * (same resident + same set of source assessment_approved_facts ids) never creates a second
 * contact or duplicate role rows — see lib/contacts/importantPeopleResolution.ts's own comment
 * for the mechanism. Every role is written with status 'claimed', never 'verified' — a role
 * reported by an assessment is never equivalent to evidence-backed authority, regardless of
 * which role_type it is (including medical_poa/financial_poa). */
export async function confirmImportantPersonProposal(
  input: ConfirmImportantPersonInput
): Promise<{ error?: string; contactId?: string }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const existingReferences = await getAssessmentSourcedRoleReferencesForResident(input.residentId);
  const requestedRoles = input.roles.map((r) => ({ roleType: r.roleType, sourceApprovedFactId: r.sourceApprovedFactId, sourceFieldPath: "" }));
  const missingRoles = computeMissingRoleInserts(requestedRoles, existingReferences);

  // A prior call (this exact click retried, or a page reload resubmitting) may have already
  // recorded some or all of this proposal's roles — if so, ALWAYS reuse that contact, regardless
  // of what `decision` says now. This is what stops a stale retry from ever creating a second
  // contact for a proposal that was already (even partially) canonicalized.
  const existingRoleRows = await getContactRolesForResident(input.residentId);
  const alreadyRecordedRole = existingRoleRows.find((row) =>
    input.roles.some((requested) => requested.sourceApprovedFactId === row.source_reference)
  );

  let contactId: string;
  if (alreadyRecordedRole) {
    contactId = alreadyRecordedRole.contact_id;
  } else if (input.decision.type === "link_existing") {
    const existingContact = await getContactById(input.decision.contactId);
    if (!existingContact) return { error: "The selected existing contact could not be found." };
    contactId = existingContact.id;

    // Never silently overwrite a conflicting current value — only fill in genuinely empty
    // fields. Provenance is recorded regardless, so what this assessment asserted is never lost
    // even when it doesn't win the current value.
    if (input.firstName && !existingContact.first_name) {
      await setContactFieldIfEmpty(contactId, "first_name", input.firstName, authResult.actor);
    }
    if (input.lastName && !existingContact.last_name) {
      await setContactFieldIfEmpty(contactId, "last_name", input.lastName, authResult.actor);
    }
    if (input.phone && !existingContact.phone) {
      await setContactFieldIfEmpty(contactId, "phone", input.phone, authResult.actor);
      const normalized = normalizeContactPhone(input.phone);
      if (normalized) await setContactFieldIfEmpty(contactId, "normalized_phone", normalized, authResult.actor);
    }
  } else {
    const created = await createContact({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      normalizedPhone: input.phone ? normalizeContactPhone(input.phone) : null,
      createdBy: authResult.actor,
    });
    if (!created) return { error: "Could not create the contact." };
    contactId = created.id;
  }

  if (input.firstName) {
    await recordContactFieldProvenance({
      contactId,
      fieldName: "first_name",
      value: input.firstName,
      source: "assessment",
      sourceReference: input.nameSourceApprovedFactId,
      assertedBy: authResult.actor,
    });
  }
  if (input.lastName) {
    await recordContactFieldProvenance({
      contactId,
      fieldName: "last_name",
      value: input.lastName,
      source: "assessment",
      sourceReference: input.nameSourceApprovedFactId,
      assertedBy: authResult.actor,
    });
  }
  if (input.phone) {
    await recordContactFieldProvenance({
      contactId,
      fieldName: "phone",
      value: input.phone,
      source: "assessment",
      sourceReference: input.phoneSourceApprovedFactId ?? input.nameSourceApprovedFactId,
      assertedBy: authResult.actor,
    });
  }

  for (const role of missingRoles) {
    await insertContactRole({
      contactId,
      residentId: input.residentId,
      roleType: role.roleType,
      status: ASSESSMENT_DERIVED_ROLE_STATUS,
      source: "assessment",
      sourceReference: role.sourceApprovedFactId,
      createdBy: authResult.actor,
    });
  }

  return { contactId };
}
