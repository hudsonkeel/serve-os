"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  canAccessWorkforceDocuments,
  canCorrectWorkforceIdentityLinks,
  canEditWorkforceCanonicalProfile,
  canEditWorkforceLegalIdentity,
  canManageWorkforceCommunityMemberships,
  canTriggerAxisCareSync,
} from "@/lib/workforce/permissions";
import { syncAxisCareCaregivers } from "@/lib/workforce/axiscareCaregiverSync";
import {
  buildDocumentStoragePath,
  getSignedDocumentUrl,
  uploadDocumentBytes,
  validateDocumentFile,
} from "@/lib/workforce/storage";
import {
  confirmPersonVendorIdentityLink,
  deferPersonVendorIdentityLink,
  getAllPersonVendorIdentityLinksForSource,
  getPersonVendorIdentityLinkById,
  getPersonVendorIdentityLinkDecisions,
  promotePersonVendorIdentityLinkToPrimary,
  reassignConfirmedVendorIdentityLinkSubject,
  rejectPersonVendorIdentityLink,
  reopenPersonVendorIdentityLink,
  setPersonVendorIdentityLinkRole,
} from "@/lib/data/personVendorIdentityLinks";
import { buildIdentityRejectionWarning, findPotentialDuplicateLinks } from "@/lib/workforce/identityDuplicateDetection";
import {
  createStandaloneWorkforceMember,
  getWorkforceMemberById,
  listWorkforceMembers,
  lockWorkforceCanonicalProfile,
  reviewWorkforceCanonicalProfile,
  unlockWorkforceCanonicalProfile,
  updateWorkforceCanonicalProfile,
} from "@/lib/data/workforceMembers";
import { deriveCanonicalIdentityFromAxisCare, type AxisCareApprovedCaregiverData } from "@/lib/workforce/axiscareFieldAllowlist";
import { upsertWorkforceCommunityMembership } from "@/lib/data/workforceCommunityMemberships";
import { resolveWorkforceProfileDiscrepancy } from "@/lib/data/workforceProfileDiscrepancies";
import { recordWorkforceActivity } from "@/lib/data/workforceActivity";
import {
  createPersonDocument,
  getPersonDocumentById,
  supersedePersonDocument,
  updateUnverifiedDocumentMetadata,
} from "@/lib/data/personDocuments";
import {
  createPersonEvidence,
  deleteUnverifiedPersonEvidence,
  getPersonEvidenceById,
  hasSupersedingEvidence,
  markPersonEvidenceEnteredInError,
  markPersonEvidenceSuperseded,
  reassignUnverifiedPersonEvidenceSubject,
  rejectPersonEvidence,
  updateUnverifiedPersonEvidence,
  verifyPersonEvidence,
} from "@/lib/data/personEvidence";
import { getRequirementByCode, getRequirementById } from "@/lib/data/personRequirements";
import { attestationVerificationOutcome } from "@/lib/workforce/humanAttestation";
import { deleteDocumentBytes } from "@/lib/workforce/storage";
import { getWorkforceMemberProfile } from "@/lib/workforce/roster";
import { getEmployeeRecordAuditEvaluation } from "@/lib/workforce/employeeRecordAuditReadiness";
import { syncWorkforceComplianceActionsForMember } from "@/lib/workforce/complianceActionSync";
import {
  resolveComplianceAction,
  setComplianceActionOwnerAndDueDate,
} from "@/lib/data/workforceComplianceActions";
import {
  buildSupersedingEvidenceIdentity,
  canEditInPlace,
  canHardDelete,
  canMarkEnteredInError,
  canReassign,
  canSupersede,
  resolveSupersedeEventType,
  type SupersedeActionKind,
} from "@/lib/workforce/evidenceLifecycle";
import {
  SUBJECT_TYPE_WORKFORCE_MEMBER,
  type AttestationResult,
  type AuthoritativeSourceSystem,
  type EvidenceVerificationMethod,
  type LinkRole,
  type PersonEvidenceResult,
  type PersonVendorIdentityLinkDecision,
  type WorkforceCommunityMembershipStatus,
} from "@/lib/supabase/types";

async function currentActor(): Promise<{ label: string; role: string | null } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, role: profile.role ?? null };
}

// Reconciles Employee Record Audit compliance actions for one member —
// called after every evidence-affecting mutation so "readiness updates
// automatically... no manual recalculation" holds in practice, not just in
// principle. Never throws; a failed sync should never fail the mutation
// that triggered it (the evidence change itself already succeeded).
async function syncComplianceActionsFor(workforceMemberId: string, actor: string): Promise<void> {
  try {
    const profile = await getWorkforceMemberProfile(workforceMemberId);
    if (!profile) return;
    const era = await getEmployeeRecordAuditEvaluation(workforceMemberId, profile.lifecycle.status);
    await syncWorkforceComplianceActionsForMember(workforceMemberId, profile.lifecycle.status, era.registry.requirements, actor);
  } catch (err) {
    console.error("[syncComplianceActionsFor]", { workforceMemberId, err });
  }
}

// ─── AxisCare Sync ──────────────────────────────────────────────────────────
export async function triggerAxisCareCaregiverSync(): Promise<{
  summary?: Awaited<ReturnType<typeof syncAxisCareCaregivers>>;
  error?: string;
}> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to sync caregivers." };
  if (!canTriggerAxisCareSync(actor.role)) {
    return { error: "You do not have permission to sync caregivers." };
  }

  const summary = await syncAxisCareCaregivers(actor.label);
  return { summary };
}

// ─── Identity Review ────────────────────────────────────────────────────────
// mode "existing"/"new_profile" links this AxisCare record as the primary
// identity for a workforce member (the ordinary first-link path). Use
// linkWorkforceIdentityAsSecondaryRecord below for "Link as duplicate/
// retired AxisCare identity" against an already-linked workforce member.
export async function confirmWorkforceIdentityLink(input: {
  linkId: string;
  mode: "existing" | "new_profile";
  subjectId?: string;
}): Promise<{ error?: string; workforceMemberId?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to confirm an identity link." };

  const link = await getPersonVendorIdentityLinkById(input.linkId);
  if (!link) return { error: "Identity link not found." };

  let workforceMemberId: string;
  let createdNewProfile = false;

  if (input.mode === "new_profile") {
    // Initialize the canonical identity from this link's own approved
    // AxisCare data at creation time — not derived later by a join, since
    // this link isn't linked to the new member's id until the confirm RPC
    // below runs. See
    // supabase/migrations/20260812000000_add_workforce_member_canonical_identity.sql.
    const sourceData = (link.approved_source_data ?? {}) as unknown as AxisCareApprovedCaregiverData;
    const identity = deriveCanonicalIdentityFromAxisCare(sourceData, link.vendor_display_name);
    if (!identity.displayName) {
      return { error: "AxisCare did not provide a name for this record — cannot create a workforce profile without a human-readable name." };
    }

    const created = await createStandaloneWorkforceMember({
      createdBy: actor.label,
      displayName: identity.displayName,
      legalFirstName: identity.legalFirstName,
      legalLastName: identity.legalLastName,
      preferredName: identity.preferredName,
    });
    if (created.error || !created.member) {
      return { error: created.error ?? "Could not create workforce profile." };
    }
    workforceMemberId = created.member.id;
    createdNewProfile = true;
  } else {
    if (!input.subjectId) {
      return { error: "A workforce member must be selected to confirm this link." };
    }
    workforceMemberId = input.subjectId;
  }

  const confirmResult = await confirmPersonVendorIdentityLink({
    linkId: input.linkId,
    subjectId: workforceMemberId,
    actor: actor.label,
    linkRole: "primary",
  });
  if (confirmResult.error) return { error: confirmResult.error };

  if (createdNewProfile) {
    await recordWorkforceActivity({
      workforceMemberId,
      eventType: "workforce_profile_created",
      eventTitle: "Workforce profile created",
      eventDescription: `Created from an AxisCare caregiver identity confirmation by ${actor.label}.`,
      source: "person_vendor_identity_links",
      systemGenerated: false,
      createdBy: actor.label,
    });
  }

  await recordWorkforceActivity({
    workforceMemberId,
    eventType: "identity_link_confirmed",
    eventTitle: `AxisCare identity confirmed`,
    eventDescription: `Linked to AxisCare caregiver ${link.vendor_display_name ?? link.vendor_record_id} by ${actor.label}.`,
    source: "person_vendor_identity_links",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return { workforceMemberId };
}

// "Link as duplicate/retired AxisCare identity" — the reviewer action for
// a second AxisCare record confirmed to be the same person as an
// already-linked workforce member. Admin-only and requires a rationale
// (see supabase/migrations/20260811000000_add_vendor_identity_lineage.sql's
// confirm_person_vendor_identity_link, which enforces this for any
// non-primary role). Never touches the existing primary link.
export async function linkWorkforceIdentityAsSecondaryRecord(input: {
  linkId: string;
  workforceMemberId: string;
  linkRole: Exclude<LinkRole, "primary">;
  rationale: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to link an identity record." };
  if (!canCorrectWorkforceIdentityLinks(actor.role)) {
    return { error: "You do not have permission to link vendor identity records." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to link this record as duplicate or retired." };
  }

  const link = await getPersonVendorIdentityLinkById(input.linkId);
  if (!link) return { error: "Identity link not found." };

  const confirmResult = await confirmPersonVendorIdentityLink({
    linkId: input.linkId,
    subjectId: input.workforceMemberId,
    actor: actor.label,
    linkRole: input.linkRole,
    rationale: input.rationale,
  });
  if (confirmResult.error) return { error: confirmResult.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "identity_link_confirmed",
    eventTitle: `AxisCare identity linked as ${input.linkRole}`,
    eventDescription: `${link.vendor_display_name ?? link.vendor_record_id} linked as ${input.linkRole} — ${input.rationale} (by ${actor.label}).`,
    source: "person_vendor_identity_links",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

export async function rejectWorkforceIdentityLink(input: { linkId: string; rationale: string }): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to reject an identity link." };
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to reject an identity link." };
  }

  const result = await rejectPersonVendorIdentityLink({ linkId: input.linkId, actor: actor.label, rationale: input.rationale });
  return result.error ? { error: result.error } : {};
}

export async function deferWorkforceIdentityLink(input: { linkId: string; rationale: string }): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to defer an identity link." };
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to defer an identity link." };
  }

  const result = await deferPersonVendorIdentityLink({ linkId: input.linkId, actor: actor.label, rationale: input.rationale });
  return result.error ? { error: result.error } : {};
}

// ─── Identity-decision corrections (admin-only) ────────────────────────────
// See supabase/migrations/20260811000000_add_vendor_identity_lineage.sql.
// Every action here requires a rationale and is preserved in
// person_vendor_identity_link_decisions — none merges, deletes, or
// silently overwrites an AxisCare record.

// Reopens a rejected/deferred decision for re-review — e.g. the Locardia
// case, where a wrongly-rejected AxisCare record needs reconsidering once
// its duplicate sibling is understood.
export async function reopenWorkforceIdentityLink(input: { linkId: string; rationale: string }): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to reopen an identity decision." };
  if (!canCorrectWorkforceIdentityLinks(actor.role)) {
    return { error: "You do not have permission to reopen identity decisions." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to reopen an identity decision." };
  }

  const result = await reopenPersonVendorIdentityLink({ linkId: input.linkId, actor: actor.label, rationale: input.rationale });
  return result.error ? { error: result.error } : {};
}

// Promotes a confirmed duplicate/retired link to primary — atomically
// demotes whatever was previously primary (if anything) in the same DB
// transaction. Immediately changes which record drives the workforce
// member's displayed profile fields and lifecycle status on next read,
// since lib/workforce/roster.ts always re-derives both from whichever
// confirmed link currently has link_role='primary'.
export async function promoteWorkforceIdentityLinkToPrimary(input: {
  linkId: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to promote an identity link." };
  if (!canCorrectWorkforceIdentityLinks(actor.role)) {
    return { error: "You do not have permission to promote identity links." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to promote an identity link." };
  }

  const link = await getPersonVendorIdentityLinkById(input.linkId);
  if (!link) return { error: "Identity link not found." };
  if (!link.subject_id) return { error: "This identity link has no associated workforce member." };

  const result = await promotePersonVendorIdentityLinkToPrimary({
    linkId: input.linkId,
    actor: actor.label,
    rationale: input.rationale,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: link.subject_id,
    eventType: "identity_link_promoted_to_primary",
    eventTitle: "AxisCare identity promoted to primary",
    eventDescription: `${link.vendor_display_name ?? link.vendor_record_id} promoted to primary — ${input.rationale} (by ${actor.label}).`,
    source: "person_vendor_identity_links",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

// Demotes/retires a confirmed link — refuses 'primary' (use
// promoteWorkforceIdentityLinkToPrimary, which has the atomic sibling-
// demotion side effect this does not).
export async function setWorkforceIdentityLinkRole(input: {
  linkId: string;
  newRole: Exclude<LinkRole, "primary">;
  rationale: string;
  duplicateOfLinkId?: string | null;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to change an identity link's role." };
  if (!canCorrectWorkforceIdentityLinks(actor.role)) {
    return { error: "You do not have permission to change identity link roles." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to change an identity link's role." };
  }

  const link = await getPersonVendorIdentityLinkById(input.linkId);
  if (!link) return { error: "Identity link not found." };
  if (!link.subject_id) return { error: "This identity link has no associated workforce member." };

  const result = await setPersonVendorIdentityLinkRole({
    linkId: input.linkId,
    newRole: input.newRole,
    actor: actor.label,
    rationale: input.rationale,
    duplicateOfLinkId: input.duplicateOfLinkId,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: link.subject_id,
    eventType: "identity_link_role_changed",
    eventTitle: `AxisCare identity marked ${input.newRole}`,
    eventDescription: `${link.vendor_display_name ?? link.vendor_record_id} marked ${input.newRole} — ${input.rationale} (by ${actor.label}).`,
    source: "person_vendor_identity_links",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

// Corrects a confirmed link that was assigned to the wrong workforce
// member. Records activity on the new subject's timeline (the record's
// new home), naming the prior workforce member for continuity — mirrors
// reassignWorkforceEvidence's convention.
export async function reassignWorkforceIdentityLink(input: {
  linkId: string;
  newWorkforceMemberId: string;
  rationale: string;
  newLinkRole?: LinkRole;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to reassign an identity link." };
  if (!canCorrectWorkforceIdentityLinks(actor.role)) {
    return { error: "You do not have permission to reassign identity links." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to reassign an identity link." };
  }

  const link = await getPersonVendorIdentityLinkById(input.linkId);
  if (!link) return { error: "Identity link not found." };
  const previousWorkforceMemberId = link.subject_id;

  const result = await reassignConfirmedVendorIdentityLinkSubject({
    linkId: input.linkId,
    newSubjectId: input.newWorkforceMemberId,
    actor: actor.label,
    rationale: input.rationale,
    newLinkRole: input.newLinkRole,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.newWorkforceMemberId,
    eventType: "identity_link_subject_reassigned",
    eventTitle: "AxisCare identity reassigned to this caregiver",
    eventDescription: `${link.vendor_display_name ?? link.vendor_record_id} reassigned by ${actor.label} — ${input.rationale} (moved from workforce member ${previousWorkforceMemberId ?? "unassigned"}).`,
    source: "person_vendor_identity_links",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

// Decision history for one link — "preserve the previous decision in audit
// history," made visible to the reviewer.
export async function getWorkforceIdentityLinkHistory(linkId: string): Promise<PersonVendorIdentityLinkDecision[]> {
  const actor = await currentActor();
  if (!actor) return [];
  return getPersonVendorIdentityLinkDecisions(linkId);
}

// Other AxisCare records with a matching normalized name/email/phone — the
// duplicate-candidate surface shown alongside a link in the review queue
// (requirement 4). Read-only; never links or merges anything itself.
export async function getWorkforceIdentityDuplicateCandidates(linkId: string) {
  const link = await getPersonVendorIdentityLinkById(linkId);
  if (!link) return [];
  const allLinks = await getAllPersonVendorIdentityLinksForSource(link.subject_type, link.source_system);
  return findPotentialDuplicateLinks(link, allLinks);
}

// The pre-rejection warning (requirement 5) — surfaced before a reviewer
// rejects a proposed link, recommending they review both records together
// when a likely duplicate exists. Never blocks the rejection.
export async function getWorkforceIdentityRejectionWarning(linkId: string) {
  const link = await getPersonVendorIdentityLinkById(linkId);
  if (!link) return { shouldWarn: false, reasons: [] as string[] };
  const allLinks = await getAllPersonVendorIdentityLinksForSource(link.subject_type, link.source_system);
  return buildIdentityRejectionWarning(link, allLinks);
}

// ─── Documents & Evidence ───────────────────────────────────────────────────
export async function uploadWorkforceDocument(formData: FormData): Promise<{ error?: string; documentId?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to upload a document." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to upload workforce documents." };
  }

  const workforceMemberId = String(formData.get("workforceMemberId") ?? "");
  const requirementCode = String(formData.get("requirementCode") ?? "");
  const documentType = String(formData.get("documentType") ?? "");
  const documentDate = (formData.get("documentDate") as string | null) || null;
  const file = formData.get("file");

  if (!workforceMemberId || !requirementCode || !documentType) {
    return { error: "Caregiver, requirement, and document type are required." };
  }
  if (!(file instanceof File)) {
    return { error: "No file provided." };
  }

  const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
  if (!validation.ok) return { error: validation.error };

  const requirement = await getRequirementByCode(requirementCode);
  if (!requirement) return { error: `Unknown requirement: ${requirementCode}` };

  const documentId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath({
    subjectType: SUBJECT_TYPE_WORKFORCE_MEMBER,
    subjectId: workforceMemberId,
    documentType,
    documentId,
  });

  const bytes = await file.arrayBuffer();
  const uploadResult = await uploadDocumentBytes(storagePath, bytes);
  if (uploadResult.error) return { error: uploadResult.error };

  const documentResult = await createPersonDocument({
    subjectType: SUBJECT_TYPE_WORKFORCE_MEMBER,
    subjectId: workforceMemberId,
    storageBucket: "person-documents",
    storagePath,
    originalFilename: file.name,
    documentType,
    mimeType: file.type,
    fileSizeBytes: file.size,
    documentDate,
    uploadedBy: actor.label,
    checksum: null,
  });
  if (documentResult.error || !documentResult.document) {
    return { error: documentResult.error ?? "Could not save document metadata." };
  }

  const evidenceResult = await createPersonEvidence({
    subjectType: SUBJECT_TYPE_WORKFORCE_MEMBER,
    subjectId: workforceMemberId,
    requirementId: requirement.id,
    documentId: documentResult.document.id,
    result: null,
    performedAt: documentDate ? new Date(documentDate).toISOString() : null,
    effectiveDate: documentDate,
    reviewDueDate: null,
    expirationDate: null,
    enteredBy: actor.label,
    notes: null,
  });
  if (evidenceResult.error) {
    return { error: `Document uploaded but evidence record failed: ${evidenceResult.error}` };
  }

  await recordWorkforceActivity({
    workforceMemberId,
    eventType: "document_uploaded",
    eventTitle: `${requirement.name} document uploaded`,
    eventDescription: `Uploaded by ${actor.label}.`,
    source: "person_documents",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await recordWorkforceActivity({
    workforceMemberId,
    eventType: "evidence_created",
    eventTitle: `${requirement.name} evidence recorded`,
    eventDescription: "Awaiting verification.",
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await syncComplianceActionsFor(workforceMemberId, actor.label);

  return { documentId: documentResult.document.id };
}

export async function verifyWorkforceEvidence(input: {
  evidenceId: string;
  workforceMemberId: string;
  requirementName: string;
  result: PersonEvidenceResult;
  notes: string | null;
  numericScore?: number | null;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to verify evidence." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to verify workforce evidence." };
  }

  const result = await verifyPersonEvidence({
    evidenceId: input.evidenceId,
    verifiedBy: actor.label,
    result: input.result,
    notes: input.notes,
    numericScore: input.numericScore,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "evidence_verified",
    eventTitle: `${input.requirementName} evidence verified`,
    eventDescription: `Result: ${input.result}. Verified by ${actor.label}.`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await syncComplianceActionsFor(input.workforceMemberId, actor.label);

  return {};
}

export async function rejectWorkforceEvidence(input: {
  evidenceId: string;
  workforceMemberId: string;
  requirementName: string;
  notes: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to reject evidence." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to reject workforce evidence." };
  }
  if (!input.notes || input.notes.trim().length === 0) {
    return { error: "A reason is required to reject evidence." };
  }

  const result = await rejectPersonEvidence({ evidenceId: input.evidenceId, rejectedBy: actor.label, notes: input.notes });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "evidence_rejected",
    eventTitle: `${input.requirementName} evidence rejected`,
    eventDescription: `${input.notes} — rejected by ${actor.label}.`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await syncComplianceActionsFor(input.workforceMemberId, actor.label);

  return {};
}

// ─── Human Attestation & Evidence Assurance (Phase 1D) ────────────────────
// "Verify From Source" — an authorized person personally reviews an
// authoritative source (Viventium, AxisCare, the Texas NAR, SEMARC, a
// background vendor, an uploaded record, or another authorized source) and
// records that review here. The authoritative source stays the source of
// truth; this action only records that the review happened, by whom, when,
// and what was observed.
//
// verifiedBy/enteredBy always come from the authenticated session
// (currentActor(), same as every other evidence-mutating action in this
// file) — never from client-submitted actor text.
//
// The attestation IS the verification act: the new evidence row is created
// and immediately resolved to verified or rejected in the same call,
// depending on whether the observed result is acceptable for this specific
// requirement (lib/workforce/humanAttestation.ts's
// attestationVerificationOutcome() — never assumes one outcome like
// "completed_closed" is universally sufficient; that decision is made per
// requirement code, not centrally). A rejected outcome still preserves
// verified_by/verified_at (provenance survives regardless of outcome — see
// the loosened person_evidence_verification_fields_check in
// supabase/migrations/20260817000000_add_human_attestation.sql).
//
// If a current evidence row already exists for this requirement, the new
// attestation supersedes it through the exact same lifecycle mechanism
// supersedeWorkforceEvidence() already uses below — no new supersession
// concept, no in-place edit, full history preserved.
//
// Immediately after, syncComplianceActionsFor() re-evaluates the
// requirement set and reconciles open compliance actions — readiness and
// open work can never drift apart from a recorded attestation, exactly as
// they can't after any other evidence mutation.
// FormData (not a plain object) — matches this codebase's own convention
// for actions that may carry an optional file (uploadWorkforceDocument
// above), since the optional Supporting Document reuses the exact same
// upload primitives (buildDocumentStoragePath/uploadDocumentBytes/
// createPersonDocument) rather than a parallel upload path.
export async function submitHumanAttestation(formData: FormData): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record a verification." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to record workforce verifications." };
  }

  const workforceMemberId = String(formData.get("workforceMemberId") ?? "");
  const requirementCode = String(formData.get("requirementCode") ?? "");
  const authoritativeSourceSystem = String(formData.get("authoritativeSourceSystem") ?? "") as AuthoritativeSourceSystem;
  const verificationMethod = String(formData.get("verificationMethod") ?? "") as EvidenceVerificationMethod;
  const attestationResult = String(formData.get("attestationResult") ?? "") as AttestationResult;
  const observedDate = (formData.get("observedDate") as string | null) || null;
  const rawNotes = (formData.get("notes") as string | null) || null;
  const externalReference = (formData.get("externalReference") as string | null) || null;
  const currentEvidenceId = (formData.get("currentEvidenceId") as string | null) || null;
  const file = formData.get("file");

  if (!workforceMemberId || !requirementCode || !authoritativeSourceSystem || !verificationMethod || !attestationResult) {
    return { error: "Authoritative source, verification method, and observed result are required." };
  }

  const requirement = await getRequirementByCode(requirementCode);
  if (!requirement) return { error: `Unknown requirement: ${requirementCode}` };

  let documentId: string | null = null;
  if (file instanceof File && file.size > 0) {
    const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
    if (!validation.ok) return { error: validation.error };

    const newDocumentId = crypto.randomUUID();
    const storagePath = buildDocumentStoragePath({
      subjectType: SUBJECT_TYPE_WORKFORCE_MEMBER,
      subjectId: workforceMemberId,
      documentType: requirement.requirement_code.toLowerCase(),
      documentId: newDocumentId,
    });
    const bytes = await file.arrayBuffer();
    const uploadResult = await uploadDocumentBytes(storagePath, bytes);
    if (uploadResult.error) return { error: uploadResult.error };

    const documentResult = await createPersonDocument({
      subjectType: SUBJECT_TYPE_WORKFORCE_MEMBER,
      subjectId: workforceMemberId,
      storageBucket: "person-documents",
      storagePath,
      originalFilename: file.name,
      documentType: requirement.requirement_code.toLowerCase(),
      mimeType: file.type,
      fileSizeBytes: file.size,
      documentDate: observedDate,
      uploadedBy: actor.label,
      checksum: null,
    });
    if (documentResult.error || !documentResult.document) {
      return { error: documentResult.error ?? "Could not save the supporting document." };
    }
    documentId = documentResult.document.id;
  }

  const outcome = attestationVerificationOutcome(requirementCode, attestationResult);
  const notes = rawNotes?.trim() || `Observed: ${attestationResult.replace(/_/g, " ")}.`;

  const evidenceResult = await createPersonEvidence({
    subjectType: SUBJECT_TYPE_WORKFORCE_MEMBER,
    subjectId: workforceMemberId,
    requirementId: requirement.id,
    documentId,
    result: null,
    performedAt: observedDate ? new Date(observedDate).toISOString() : null,
    effectiveDate: observedDate,
    reviewDueDate: null,
    expirationDate: null,
    enteredBy: actor.label,
    notes,
    supersedesEvidenceId: currentEvidenceId,
    authoritativeSourceSystem,
    collectionMethod: "human_attestation",
    verificationMethod,
    attestationResult,
    externalReference,
  });
  if (evidenceResult.error || !evidenceResult.evidence) {
    return { error: `Could not record the attestation: ${evidenceResult.error}` };
  }

  const resolution =
    outcome === "verified"
      ? await verifyPersonEvidence({ evidenceId: evidenceResult.evidence.id, verifiedBy: actor.label, result: null, notes })
      : await rejectPersonEvidence({
          evidenceId: evidenceResult.evidence.id,
          rejectedBy: actor.label,
          notes,
          verifiedBy: actor.label,
          verifiedAt: new Date().toISOString(),
        });
  if (resolution.error) {
    return { error: `Attestation recorded but could not be resolved: ${resolution.error}` };
  }

  if (currentEvidenceId) {
    const supersedeResult = await markPersonEvidenceSuperseded({
      evidenceId: currentEvidenceId,
      actor: actor.label,
      reason: `Superseded by Human Attestation from ${authoritativeSourceSystem}.`,
    });
    if (supersedeResult.error) {
      return { error: `Attestation recorded but the prior record could not be marked superseded: ${supersedeResult.error}` };
    }
  }

  await recordWorkforceActivity({
    workforceMemberId,
    eventType: "evidence_attested",
    eventTitle: `${requirement.name} verified from ${authoritativeSourceSystem}`,
    eventDescription: `Observed: ${attestationResult.replace(/_/g, " ")}. Verified by ${actor.label}.`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await syncComplianceActionsFor(workforceMemberId, actor.label);

  return {};
}

// The one action behind "Replace document," "Correct with new evidence,"
// generic "Supersede," and "Upload renewal" — the underlying data operation
// is identical (a new, unverified evidence row supersedes the old one,
// which moves to lifecycle_status='superseded'); only the human-facing
// event type and whether a new file is required differ by actionKind. Only
// ever acts on evidence that is settled (verified/rejected) and still
// current — see lib/workforce/evidenceLifecycle.ts's canSupersede().
// Unverified evidence must go through updateUnverifiedWorkforceEvidenceDetails
// instead; this action deliberately refuses to touch it.
export async function supersedeWorkforceEvidence(
  formData: FormData,
  actionKind: SupersedeActionKind
): Promise<{ error?: string; evidenceId?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to replace evidence." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to replace workforce evidence." };
  }

  const oldEvidenceId = String(formData.get("oldEvidenceId") ?? "");
  const rationale = String(formData.get("rationale") ?? "").trim();
  const resultRaw = (formData.get("result") as string | null) || null;
  const documentDate = (formData.get("documentDate") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;
  const file = formData.get("file");

  if (!oldEvidenceId) return { error: "The evidence being replaced is required." };
  if (!rationale) return { error: "A reason is required." };

  const oldEvidence = await getPersonEvidenceById(oldEvidenceId);
  if (!oldEvidence) return { error: "The evidence being replaced was not found." };
  if (!canSupersede(oldEvidence)) {
    return {
      error:
        oldEvidence.verification_status === "unverified"
          ? "Unverified evidence should be edited directly, not replaced."
          : "This evidence is no longer current and cannot be replaced again.",
    };
  }

  const requirement = await getRequirementById(oldEvidence.requirement_id);
  if (!requirement) return { error: "Requirement not found." };

  let newDocumentId: string | null = oldEvidence.document_id;

  // A file is optional — "Correct with new evidence" may only be fixing
  // the recorded result/dates against the same original document.
  if (file instanceof File && file.size > 0) {
    const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
    if (!validation.ok) return { error: validation.error };

    const oldDocument = oldEvidence.document_id ? await getPersonDocumentById(oldEvidence.document_id) : null;
    const documentId = crypto.randomUUID();
    const storagePath = buildDocumentStoragePath({
      subjectType: oldEvidence.subject_type,
      subjectId: oldEvidence.subject_id,
      documentType: oldDocument?.document_type ?? requirement.requirement_code.toLowerCase(),
      documentId,
    });

    const bytes = await file.arrayBuffer();
    const uploadResult = await uploadDocumentBytes(storagePath, bytes);
    if (uploadResult.error) return { error: uploadResult.error };

    const documentResult = oldDocument
      ? await supersedePersonDocument({
          oldDocumentId: oldDocument.id,
          subjectType: oldEvidence.subject_type,
          subjectId: oldEvidence.subject_id,
          storageBucket: "person-documents",
          storagePath,
          originalFilename: file.name,
          documentType: oldDocument.document_type,
          mimeType: file.type,
          fileSizeBytes: file.size,
          documentDate,
          uploadedBy: actor.label,
          checksum: null,
        })
      : await createPersonDocument({
          subjectType: oldEvidence.subject_type,
          subjectId: oldEvidence.subject_id,
          storageBucket: "person-documents",
          storagePath,
          originalFilename: file.name,
          documentType: requirement.requirement_code.toLowerCase(),
          mimeType: file.type,
          fileSizeBytes: file.size,
          documentDate,
          uploadedBy: actor.label,
          checksum: null,
        });

    if (documentResult.error || !documentResult.document) {
      return { error: documentResult.error ?? "Could not save the new document." };
    }
    newDocumentId = documentResult.document.id;
  }

  // subject/requirement always copied from the record being replaced,
  // never taken from caller input — see
  // buildSupersedingEvidenceIdentity()'s own doc comment for why this is
  // what makes cross-subject/cross-requirement replacement structurally
  // impossible from this action, before the DB trigger even runs.
  const evidenceResult = await createPersonEvidence({
    ...buildSupersedingEvidenceIdentity(oldEvidence),
    documentId: newDocumentId,
    result: (resultRaw as PersonEvidenceResult | null) ?? oldEvidence.result,
    performedAt: documentDate ? new Date(documentDate).toISOString() : oldEvidence.performed_at,
    effectiveDate: documentDate ?? oldEvidence.effective_date,
    reviewDueDate: oldEvidence.review_due_date,
    expirationDate: null, // a renewal/replacement gets a fresh review — never inherits a stale expiration
    enteredBy: actor.label,
    notes: notes ?? oldEvidence.notes,
    supersedesEvidenceId: oldEvidenceId,
  });
  if (evidenceResult.error || !evidenceResult.evidence) {
    return { error: `Could not create the replacement evidence: ${evidenceResult.error}` };
  }

  const supersedeResult = await markPersonEvidenceSuperseded({
    evidenceId: oldEvidenceId,
    actor: actor.label,
    reason: rationale,
  });
  if (supersedeResult.error) {
    return {
      error: `Replacement created but the prior record could not be marked superseded: ${supersedeResult.error}`,
    };
  }

  const eventType = resolveSupersedeEventType(actionKind);
  await recordWorkforceActivity({
    workforceMemberId: oldEvidence.subject_id,
    eventType,
    eventTitle: `${requirement.name} evidence ${eventType === "evidence_renewed" ? "renewed" : "replaced"}`,
    eventDescription: `${rationale} — by ${actor.label}.`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await syncComplianceActionsFor(oldEvidence.subject_id, actor.label);

  return { evidenceId: evidenceResult.evidence.id };
}

// "Mark entered in error" — no replacement record is created here; the
// caller may separately upload a correctly-assigned record afterward (see
// uploadWorkforceDocument). Only offered for a settled, still-current
// record — see canMarkEnteredInError().
export async function markWorkforceEvidenceEnteredInError(input: {
  evidenceId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to mark evidence entered in error." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to mark workforce evidence entered in error." };
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { error: "A reason is required." };
  }

  const evidence = await getPersonEvidenceById(input.evidenceId);
  if (!evidence) return { error: "Evidence not found." };
  if (!canMarkEnteredInError(evidence)) {
    return { error: "This evidence cannot be marked entered in error in its current state." };
  }

  const requirement = await getRequirementById(evidence.requirement_id);

  const result = await markPersonEvidenceEnteredInError({
    evidenceId: input.evidenceId,
    actor: actor.label,
    reason: input.reason,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: evidence.subject_id,
    eventType: "evidence_marked_entered_in_error",
    eventTitle: `${requirement?.name ?? "Evidence"} marked entered in error`,
    eventDescription: `${input.reason} — by ${actor.label}.`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await syncComplianceActionsFor(evidence.subject_id, actor.label);

  return {};
}

// ─── Unverified evidence/document corrections (free editing) ─────────────
// Only reaches an unverified row — see canEditInPlace(). Edits document
// fields, evidence fields, or both in one call, firing the matching audit
// event(s).
export async function updateUnverifiedWorkforceEvidenceDetails(input: {
  evidenceId: string;
  requirementCode?: string;
  documentType?: string;
  documentDate?: string | null;
  result?: PersonEvidenceResult | null;
  reviewDueDate?: string | null;
  expirationDate?: string | null;
  notes?: string | null;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to edit evidence." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to edit workforce evidence." };
  }

  const evidence = await getPersonEvidenceById(input.evidenceId);
  if (!evidence) return { error: "Evidence not found." };
  if (!canEditInPlace(evidence)) {
    return { error: "This evidence has already been reviewed and can no longer be edited directly." };
  }

  let requirementId: string | undefined;
  if (input.requirementCode) {
    const requirement = await getRequirementByCode(input.requirementCode);
    if (!requirement) return { error: `Unknown requirement: ${input.requirementCode}` };
    requirementId = requirement.id;
  }

  if (input.documentType !== undefined || input.documentDate !== undefined) {
    if (evidence.document_id) {
      const docResult = await updateUnverifiedDocumentMetadata({
        documentId: evidence.document_id,
        documentType: input.documentType,
        documentDate: input.documentDate ?? undefined,
      });
      if (docResult.error) return { error: docResult.error };

      await recordWorkforceActivity({
        workforceMemberId: evidence.subject_id,
        eventType: "document_metadata_corrected",
        eventTitle: "Document details corrected",
        eventDescription: `Corrected by ${actor.label}.`,
        source: "person_documents",
        systemGenerated: false,
        createdBy: actor.label,
      });
    }
  }

  const evidenceResult = await updateUnverifiedPersonEvidence({
    evidenceId: input.evidenceId,
    requirementId,
    result: input.result,
    effectiveDate: input.documentDate,
    reviewDueDate: input.reviewDueDate,
    expirationDate: input.expirationDate,
    notes: input.notes,
  });
  if (evidenceResult.error) return { error: evidenceResult.error };

  await recordWorkforceActivity({
    workforceMemberId: evidence.subject_id,
    eventType: "evidence_corrected",
    eventTitle: "Evidence details corrected",
    eventDescription: `Corrected by ${actor.label}.`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

// Atomic reassignment to a different workforce member — unverified evidence
// only (canReassign()). Records the activity event on the NEW subject's
// timeline, since that's who the record now belongs to; the description
// names the prior caregiver for continuity.
export async function reassignWorkforceEvidence(input: {
  evidenceId: string;
  newWorkforceMemberId: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to reassign evidence." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to reassign workforce evidence." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to reassign evidence." };
  }

  const evidence = await getPersonEvidenceById(input.evidenceId);
  if (!evidence) return { error: "Evidence not found." };
  if (!canReassign(evidence)) {
    return { error: "This evidence cannot be reassigned in its current state." };
  }

  const result = await reassignUnverifiedPersonEvidenceSubject({
    evidenceId: input.evidenceId,
    newSubjectId: input.newWorkforceMemberId,
    actor: actor.label,
    rationale: input.rationale,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.newWorkforceMemberId,
    eventType: "document_reassigned",
    eventTitle: "Evidence reassigned to this caregiver",
    eventDescription: `${input.rationale} — reassigned by ${actor.label} (moved from workforce member ${evidence.subject_id}).`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  // Both sides of the reassignment can gain or lose a satisfied
  // requirement — sync compliance actions for whoever actually still
  // exists as a workforce member (the old subject_id remains valid; only
  // the evidence moved).
  await syncComplianceActionsFor(input.newWorkforceMemberId, actor.label);
  await syncComplianceActionsFor(evidence.subject_id, actor.label);

  return {};
}

// Hard delete — the only destructive action Evidence Management permits,
// and only for an unverified accidental upload nothing else has relied
// upon (canHardDelete()). Storage cleanup happens after the DB rows are
// gone, using the path read beforehand; a storage failure is logged but
// does not fail the overall action (see deleteDocumentBytes()).
export async function deleteAccidentalWorkforceUpload(evidenceId: string): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to delete an accidental upload." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to delete workforce documents." };
  }

  const evidence = await getPersonEvidenceById(evidenceId);
  if (!evidence) return { error: "Evidence not found." };

  const hasSuperseder = await hasSupersedingEvidence(evidenceId);
  if (!canHardDelete(evidence, hasSuperseder)) {
    return { error: "This evidence cannot be deleted — it has already been reviewed or relied upon." };
  }

  const document = evidence.document_id ? await getPersonDocumentById(evidence.document_id) : null;
  const workforceMemberId = evidence.subject_id;

  const deleteResult = await deleteUnverifiedPersonEvidence({ evidenceId, actor: actor.label });
  if (deleteResult.error) return { error: deleteResult.error };

  if (document) {
    const storageResult = await deleteDocumentBytes(document.storage_path);
    if (storageResult.error) {
      console.error("[deleteAccidentalWorkforceUpload]", storageResult.error);
    }
  }

  await recordWorkforceActivity({
    workforceMemberId,
    eventType: "accidental_upload_removed",
    eventTitle: "Accidental upload removed",
    eventDescription: `Removed by ${actor.label}.`,
    source: "person_evidence",
    systemGenerated: false,
    createdBy: actor.label,
  });
  await syncComplianceActionsFor(workforceMemberId, actor.label);

  return {};
}

export async function getWorkforceDocumentSignedUrl(documentId: string): Promise<{ url?: string; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to view this document." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to view workforce documents." };
  }

  const document = await getPersonDocumentById(documentId);
  if (!document) return { error: "Document not found." };

  return getSignedDocumentUrl(document.storage_path);
}

// ─── Canonical Profile Editor ──────────────────────────────────────────
// See supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
// A manager may edit preferred name/display name/contact fields and
// community-specific fields, but never legal identity directly — see
// lib/workforce/permissions.ts's canEditWorkforceLegalIdentity(). This
// action-layer check is the only place a caller's role is known (the RPC
// itself only receives an actor label, matching every other RPC in this
// file); it's a courtesy gate for a manager attempting to slip a legal
// name change through the same save, not a substitute for admin-gated
// review/lock actions below.
export async function saveWorkforceCanonicalProfile(input: {
  workforceMemberId: string;
  legalFirstName: string | null;
  legalMiddleName: string | null;
  legalLastName: string | null;
  preferredName: string | null;
  displayName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  rationale: string | null;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to edit a workforce profile." };
  if (!canEditWorkforceCanonicalProfile(actor.role)) {
    return { error: "You do not have permission to edit workforce canonical profiles." };
  }

  if (!canEditWorkforceLegalIdentity(actor.role)) {
    const current = await getWorkforceMemberById(input.workforceMemberId);
    if (!current) return { error: "Workforce member not found." };
    const normalize = (v: string | null) => (v && v.trim().length > 0 ? v.trim() : null);
    const legalChanged =
      normalize(input.legalFirstName) !== current.legal_first_name ||
      normalize(input.legalMiddleName) !== current.legal_middle_name ||
      normalize(input.legalLastName) !== current.legal_last_name;
    if (legalChanged) {
      return { error: "Only an admin can change a caregiver's legal name — request a legal-name correction instead." };
    }
  }

  const result = await updateWorkforceCanonicalProfile({
    workforceMemberId: input.workforceMemberId,
    legalFirstName: input.legalFirstName,
    legalMiddleName: input.legalMiddleName,
    legalLastName: input.legalLastName,
    preferredName: input.preferredName,
    displayName: input.displayName,
    primaryEmail: input.primaryEmail,
    primaryPhone: input.primaryPhone,
    actor: actor.label,
    rationale: input.rationale,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "canonical_profile_updated",
    eventTitle: "Serve canonical profile updated",
    eventDescription: `Updated by ${actor.label}${input.rationale ? ` — ${input.rationale}` : ""}.`,
    source: "workforce_members",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

export async function reviewWorkforceProfile(input: { workforceMemberId: string; rationale: string }): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to review a workforce profile." };
  if (!canEditWorkforceLegalIdentity(actor.role)) {
    return { error: "You do not have permission to review workforce canonical profiles." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to review a profile." };
  }

  const result = await reviewWorkforceCanonicalProfile({ workforceMemberId: input.workforceMemberId, actor: actor.label, rationale: input.rationale });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "canonical_profile_reviewed",
    eventTitle: "Serve canonical profile reviewed",
    eventDescription: `${input.rationale} — reviewed by ${actor.label}.`,
    source: "workforce_members",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

export async function lockWorkforceProfile(input: { workforceMemberId: string; rationale: string }): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to lock a workforce profile." };
  if (!canEditWorkforceLegalIdentity(actor.role)) {
    return { error: "You do not have permission to lock workforce canonical profiles." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to lock a profile." };
  }

  const result = await lockWorkforceCanonicalProfile({ workforceMemberId: input.workforceMemberId, actor: actor.label, rationale: input.rationale });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "canonical_profile_locked",
    eventTitle: "Serve canonical profile locked",
    eventDescription: `${input.rationale} — locked by ${actor.label}.`,
    source: "workforce_members",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

export async function unlockWorkforceProfile(input: { workforceMemberId: string; rationale: string }): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to unlock a workforce profile." };
  if (!canEditWorkforceLegalIdentity(actor.role)) {
    return { error: "You do not have permission to unlock workforce canonical profiles." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to unlock a profile." };
  }

  const result = await unlockWorkforceCanonicalProfile({ workforceMemberId: input.workforceMemberId, actor: actor.label, rationale: input.rationale });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "canonical_profile_unlocked",
    eventTitle: "Serve canonical profile unlocked",
    eventDescription: `${input.rationale} — unlocked by ${actor.label}.`,
    source: "workforce_members",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

// Reviewer decision on an open source discrepancy — "accept the source
// change or retain canonical value," always logged. Gated the same as
// review/lock (admin) since accepting a source value performs a canonical
// correction, not merely a preference edit.
export async function decideWorkforceProfileDiscrepancy(input: {
  discrepancyId: string;
  workforceMemberId: string;
  resolution: "accepted_source" | "retained_canonical" | "dismissed";
  rationale: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to resolve a profile discrepancy." };
  if (!canEditWorkforceLegalIdentity(actor.role)) {
    return { error: "You do not have permission to resolve workforce profile discrepancies." };
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return { error: "A rationale is required to resolve a discrepancy." };
  }

  const result = await resolveWorkforceProfileDiscrepancy({
    discrepancyId: input.discrepancyId,
    resolution: input.resolution,
    actor: actor.label,
    rationale: input.rationale,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "profile_discrepancy_resolved",
    eventTitle: "Source discrepancy resolved",
    eventDescription: `${input.resolution.replace(/_/g, " ")} — ${input.rationale} (by ${actor.label}).`,
    source: "workforce_profile_discrepancies",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

// ─── Community Memberships ─────────────────────────────────────────────
export async function saveWorkforceCommunityMembership(input: {
  workforceMemberId: string;
  communityId: string;
  membershipStatus: WorkforceCommunityMembershipStatus;
  roleType?: string | null;
  employmentRelationship?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isPrimaryCommunity?: boolean;
  communityDisplayNameOverride?: string | null;
  communityEmail?: string | null;
  communityPhone?: string | null;
  schedulerNotes?: string | null;
  availabilityNotes?: string | null;
  transportationNotes?: string | null;
  accessNotes?: string | null;
  rationale?: string | null;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to update a community membership." };
  if (!canManageWorkforceCommunityMemberships(actor.role)) {
    return { error: "You do not have permission to manage community memberships." };
  }

  const result = await upsertWorkforceCommunityMembership({ ...input, actor: actor.label });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: "community_membership_updated",
    eventTitle: "Community membership updated",
    eventDescription: `Updated by ${actor.label}.`,
    source: "workforce_community_memberships",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

// ─── Employee Record Audit — operational work ─────────────────────────
// See supabase/migrations/20260814000000_add_employee_record_audit.sql.
// Gated the same as evidence review (admin+manager) — resolving an action
// is an ordinary operational decision, not an identity/legal-identity
// correction.
export async function resolveWorkforceComplianceActionAction(input: {
  actionId: string;
  workforceMemberId: string;
  status: "resolved" | "dismissed";
  resolutionNote: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to resolve a compliance action." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to resolve workforce compliance actions." };
  }
  if (!input.resolutionNote || input.resolutionNote.trim().length === 0) {
    return { error: "A resolution note is required." };
  }

  const result = await resolveComplianceAction({
    actionId: input.actionId,
    status: input.status,
    actor: actor.label,
    resolutionNote: input.resolutionNote,
  });
  if (result.error) return { error: result.error };

  await recordWorkforceActivity({
    workforceMemberId: input.workforceMemberId,
    eventType: input.status === "resolved" ? "compliance_action_resolved" : "compliance_action_dismissed",
    eventTitle: `Compliance action ${input.status}`,
    eventDescription: `${input.resolutionNote} — ${input.status} by ${actor.label}.`,
    source: "workforce_compliance_actions",
    systemGenerated: false,
    createdBy: actor.label,
  });

  return {};
}

export async function setWorkforceComplianceActionOwnerDueDate(input: {
  actionId: string;
  owner: string | null;
  dueAt: string | null;
}): Promise<{ error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to update a compliance action." };
  if (!canAccessWorkforceDocuments(actor.role)) {
    return { error: "You do not have permission to update workforce compliance actions." };
  }

  const result = await setComplianceActionOwnerAndDueDate(input);
  if (result.error) return { error: result.error };

  return {};
}

// Admin-triggered bulk sweep — the on-demand equivalent of a scheduled
// job (this codebase has no cron infrastructure; every recurring
// evaluation here is a human-triggered button, matching the existing
// "Sync Now" AxisCare precedent). Reconciles every workforce member's
// Employee Record Audit actions against their current evidence — the
// mechanism that populates actions for evidence that existed before this
// capability shipped, and a manual safety net thereafter.
export async function triggerWorkforceComplianceActionSync(): Promise<{ error?: string; syncedCount?: number }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to sync compliance actions." };
  if (!canTriggerAxisCareSync(actor.role)) {
    return { error: "You do not have permission to run a compliance action sync." };
  }

  const members = await listWorkforceMembers();
  for (const member of members) {
    await syncComplianceActionsFor(member.id, actor.label);
  }

  return { syncedCount: members.length };
}
