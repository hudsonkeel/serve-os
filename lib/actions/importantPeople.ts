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
  type ContactRoleRow,
  type ContactRow,
} from "@/lib/data/contacts";
import {
  buildImportantPeopleProposals,
  type ApprovedFactForProposal,
  type ProposedImportantPerson,
  type UnattachedPoaClaim,
} from "@/lib/contacts/importantPeopleProposals";
import {
  evaluateContactLinkForProposal,
  decideAutomaticProjectionAction,
  describeNeedsReviewReason,
  type AutomaticProjectionAction,
} from "@/lib/contacts/importantPeopleLinking";
import { partitionProposalsByResolution, computeMissingRoleInserts } from "@/lib/contacts/importantPeopleResolution";
import { normalizeContactPhone } from "@/lib/contacts/normalization";
import { ASSESSMENT_DERIVED_ROLE_STATUS, AUTOMATIC_PROJECTION_ACTOR } from "@/lib/contacts/roleTypes";
import { formatPlainDate } from "@/lib/utils/date";
import type { AssertionState } from "@/lib/assessmentIntelligence/factTypes";

// Slice C.3 refinement (2026-09-19) — "Do not ask the user to confirm what Serve already knows."
// The original C.3 shape required a human confirmation click for every assessment-derived
// Important Person, including cases with no genuine ambiguity at all. This file now performs that
// projection AUTOMATICALLY for the two cases the existing C.2/C.3 identity machinery already
// classifies as safe (no competing candidate at all, or an exact strong match to an existing
// contact) — see lib/contacts/importantPeopleLinking.ts's decideAutomaticProjectionAction(). A
// genuinely ambiguous or conflicting match — or a bare shared name with no strong identifier — is
// NEVER auto-resolved; it is surfaced as a needs-review item with no write action of any kind.
//
// WHERE THIS RUNS: inside getImportantPeopleReviewData(), the same read path the resident page
// already calls on every load — not inside approveAssessment(). Assessment approval stays focused
// on approving/finalizing assessment knowledge; this projection is a separate, later, deterministic
// reconciliation step over already-approved facts, run the same way
// reconcileApprovedAssessmentArtifacts() closes other post-approval gaps without re-approving
// anything. Every write this performs is idempotent by construction (see
// lib/contacts/importantPeopleResolution.ts and the source_reference existence-checks in
// lib/data/contacts.ts), so re-running it on every page load — including two people viewing the
// same resident at once — never creates a duplicate contact or a duplicate role.
//
// ASSESSMENT BOUNDARY: this file only ever READS from assessment_approved_facts (via the existing,
// unmodified getApprovedFactsForResident()) — it never writes to assessment_draft_facts,
// assessment_approved_facts, or the immutable assessment_document snapshot, and never calls
// approveAssessmentSession() or anything in lib/actions/assessmentIntelligence.ts. A failure while
// materializing one proposal (a transient write error, or a genuinely thrown exception) is caught
// per-proposal and that proposal simply falls back to a needs-review state for this load rather
// than throwing — it can never corrupt or block assessment approval, which has already fully
// completed by the time this ever runs, and it never prevents the rest of the page (or this
// resident's other Important People) from rendering.
//
// PERMISSION BOUNDARY: automatic writes only run when the viewing user actually has
// canEditResidentProfile() — the same authorization boundary the original manual confirm action
// enforced. A lower-privileged viewer's page load never has a side effect they couldn't have
// triggered themselves; the projection simply runs the next time someone with edit permission
// views the resident (in practice, always the staff who act on this data). Read-only display of
// whatever is already canonicalized is unaffected by this gate.
//
// WHAT THIS DELIBERATELY DOES NOT DO: build the ambiguous-match reconciliation workflow (picking
// among candidates, recording a contact_identity_suppressions row) — a needs-review item has no
// action attached in this slice, by design: a warning/action affordance should map to a real
// available action, and no contact-identity review screen exists yet (unlike /reconciliation for
// residents or /workforce/identity-review for caregivers).

async function getViewingActorForWrite(): Promise<string | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  if (!canEditResidentProfile(profile.role)) return null;
  return AUTOMATIC_PROJECTION_ACTOR;
}

export interface ImportantPersonRoleView {
  readonly roleType: string;
  readonly status: string;
}

export interface CurrentImportantPersonView {
  readonly contactId: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly phone: string | null;
  readonly roles: readonly ImportantPersonRoleView[];
  /** "Sep 16" — the most recent approved-assessment date among this person's assessment-sourced
   * roles, for a subtle provenance note. Null when nothing here came from an assessment. */
  readonly mostRecentAssessmentDate: string | null;
}

export interface NeedsReviewPersonView {
  readonly proposalKey: string;
  readonly rawFullName: string;
  readonly phone: string | null;
  /** Short, human-facing reason (never a paragraph, never raw match evidence) — see
   * describeNeedsReviewReason(). */
  readonly reason: string;
}

export interface ImportantPeopleReviewData {
  readonly currentPeople: readonly CurrentImportantPersonView[];
  readonly needsReview: readonly NeedsReviewPersonView[];
  readonly unattachedPoaClaims: readonly UnattachedPoaClaim[];
}

/** Materializes one safe proposal into a canonical contact + its roles + field provenance.
 * Idempotent: if any of the requested roles was already recorded (by source_reference) in
 * `existingRoleRowsSnapshot` — a prior automatic projection run, a concurrent page load — this
 * always reuses that existing contact instead of creating a second one, regardless of what
 * `action` says. Existing contact field values are never overwritten, only filled in when empty;
 * every asserted value is still recorded as provenance regardless of whether it won. */
async function materializeProposal(
  proposal: ProposedImportantPerson,
  residentId: string,
  action: Extract<AutomaticProjectionAction, "auto_create" | "auto_link">,
  matchedContactId: string | null,
  actor: string,
  existingSourceReferences: ReadonlySet<string>,
  existingRoleRowsSnapshot: readonly (ContactRoleRow & { contact: ContactRow })[]
): Promise<{ contactId: string } | { error: string }> {
  const missingRoles = computeMissingRoleInserts(proposal.roles, existingSourceReferences);

  const alreadyRecordedRole = existingRoleRowsSnapshot.find((row) =>
    proposal.roles.some((requested) => requested.sourceApprovedFactId === row.source_reference)
  );

  let contactId: string;
  if (alreadyRecordedRole) {
    contactId = alreadyRecordedRole.contact_id;
  } else if (action === "auto_link" && matchedContactId) {
    const existingContact = await getContactById(matchedContactId);
    if (!existingContact) return { error: "The matched existing contact could not be found." };
    contactId = existingContact.id;

    // Never silently overwrite a conflicting current value — only fill in genuinely empty
    // fields. Provenance is recorded regardless, so what this assessment asserted is never lost
    // even when it doesn't win the current value.
    if (proposal.firstName && !existingContact.first_name) {
      await setContactFieldIfEmpty(contactId, "first_name", proposal.firstName, actor);
    }
    if (proposal.lastName && !existingContact.last_name) {
      await setContactFieldIfEmpty(contactId, "last_name", proposal.lastName, actor);
    }
    if (proposal.phone && !existingContact.phone) {
      await setContactFieldIfEmpty(contactId, "phone", proposal.phone, actor);
      const normalized = normalizeContactPhone(proposal.phone);
      if (normalized) await setContactFieldIfEmpty(contactId, "normalized_phone", normalized, actor);
    }
  } else {
    const created = await createContact({
      firstName: proposal.firstName,
      lastName: proposal.lastName,
      phone: proposal.phone,
      normalizedPhone: proposal.phone ? normalizeContactPhone(proposal.phone) : null,
      createdBy: actor,
    });
    if (!created) return { error: "Could not create the contact." };
    contactId = created.id;
  }

  if (proposal.firstName) {
    await recordContactFieldProvenance({
      contactId,
      fieldName: "first_name",
      value: proposal.firstName,
      source: "assessment",
      sourceReference: proposal.nameSourceApprovedFactId,
      assertedBy: actor,
    });
  }
  if (proposal.lastName) {
    await recordContactFieldProvenance({
      contactId,
      fieldName: "last_name",
      value: proposal.lastName,
      source: "assessment",
      sourceReference: proposal.nameSourceApprovedFactId,
      assertedBy: actor,
    });
  }
  if (proposal.phone) {
    await recordContactFieldProvenance({
      contactId,
      fieldName: "phone",
      value: proposal.phone,
      source: "assessment",
      sourceReference: proposal.phoneSourceApprovedFactId ?? proposal.nameSourceApprovedFactId,
      assertedBy: actor,
    });
  }

  for (const role of missingRoles) {
    await insertContactRole({
      contactId,
      residentId,
      roleType: role.roleType,
      status: ASSESSMENT_DERIVED_ROLE_STATUS,
      source: "assessment",
      sourceReference: role.sourceApprovedFactId,
      createdBy: actor,
    });
  }

  return { contactId };
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

  const needsReview: NeedsReviewPersonView[] = [];

  if (unresolved.length > 0) {
    const writeActor = await getViewingActorForWrite();
    // v0.1 simplicity: suppression is checked against an empty set here — no UI in this slice
    // writes a new contact_identity_suppressions row yet (that belongs to the deferred
    // reconciliation flow — see this file's own header comment). The read path already threads a
    // real suppression set through to evaluateContactLinkForProposal() structurally, so wiring an
    // actual writer later needs no change here.
    const [allContacts, existingRoleRowsSnapshot] = await Promise.all([
      getAllContactsForMatching(),
      getContactRolesForResident(residentId),
    ]);

    for (const proposal of unresolved) {
      const linkDecision = evaluateContactLinkForProposal(
        { firstName: proposal.firstName, lastName: proposal.lastName, normalizedEmail: null, normalizedPhone: proposal.normalizedPhone },
        allContacts,
        new Set()
      );
      const projectionAction = decideAutomaticProjectionAction(linkDecision);

      if (projectionAction === "needs_review") {
        needsReview.push({
          proposalKey: proposal.proposalKey,
          rawFullName: proposal.rawFullName,
          phone: proposal.phone,
          reason: describeNeedsReviewReason(linkDecision),
        });
        continue;
      }

      if (!writeActor) {
        // Viewer lacks edit permission — the projection is deferred, not skipped: it runs the
        // next time someone with edit permission views this resident. Nothing to show for it
        // meanwhile; it simply doesn't appear as current or needs-review on this particular load.
        continue;
      }

      try {
        const result = await materializeProposal(
          proposal,
          residentId,
          projectionAction,
          linkDecision.matchedContactId,
          writeActor,
          existingReferences,
          existingRoleRowsSnapshot
        );
        if ("error" in result) {
          needsReview.push({
            proposalKey: proposal.proposalKey,
            rawFullName: proposal.rawFullName,
            phone: proposal.phone,
            reason: "Could not be added automatically — needs review",
          });
        }
      } catch (err) {
        console.error("[getImportantPeopleReviewData:materializeProposal]", { residentId, proposalKey: proposal.proposalKey, err });
        needsReview.push({
          proposalKey: proposal.proposalKey,
          rawFullName: proposal.rawFullName,
          phone: proposal.phone,
          reason: "Could not be added automatically — needs review",
        });
      }
    }
  }

  // Re-read AFTER any automatic writes above, so "Current Important People" always reflects what
  // was just projected — never a stale pre-write snapshot.
  const existingRoleRows = await getContactRolesForResident(residentId);
  const approvedAtByFactId = new Map(approvedFactRows.map((f) => [f.id, f.approved_at]));

  interface AccumulatingPerson {
    contactId: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    roles: ImportantPersonRoleView[];
    latestApprovedAt: string | null;
  }

  const byContact = new Map<string, AccumulatingPerson>();
  for (const row of existingRoleRows) {
    const roleEntry: ImportantPersonRoleView = { roleType: row.role_type, status: row.status };
    const rowApprovedAt =
      row.source === "assessment" && row.source_reference ? (approvedAtByFactId.get(row.source_reference) ?? null) : null;
    const existing = byContact.get(row.contact_id);
    if (existing) {
      existing.roles.push(roleEntry);
      if (rowApprovedAt && (!existing.latestApprovedAt || rowApprovedAt > existing.latestApprovedAt)) {
        existing.latestApprovedAt = rowApprovedAt;
      }
    } else {
      byContact.set(row.contact_id, {
        contactId: row.contact_id,
        firstName: row.contact.first_name,
        lastName: row.contact.last_name,
        phone: row.contact.phone,
        roles: [roleEntry],
        latestApprovedAt: rowApprovedAt,
      });
    }
  }

  const currentPeople: CurrentImportantPersonView[] = [...byContact.values()].map((p) => ({
    contactId: p.contactId,
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    roles: p.roles,
    mostRecentAssessmentDate: p.latestApprovedAt ? formatPlainDate(p.latestApprovedAt, { includeYear: false }) : null,
  }));

  return { currentPeople, needsReview, unattachedPoaClaims };
}
