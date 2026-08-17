"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canAccessResidentEvidence } from "@/lib/auth/permissions";
import type { AuthRole } from "@/lib/auth/constants";
import { getRequirementByCode } from "@/lib/data/personRequirements";
import { getPersonEvidenceForSubject } from "@/lib/data/personEvidence";
import { createPersonDocument } from "@/lib/data/personDocuments";
import { linkEvidenceToRequirement } from "@/lib/data/requirementEvidenceLinks";
import {
  recordCareDocumentationAttestation,
  recordDocumentEvidence,
  recordGuardianNoneAttestation,
  recordMedicationListAttestation,
} from "@/lib/clientReadiness/evidence";
import {
  CR_BILLING_AGREEMENT_ON_FILE,
  CR_CARE_DOCUMENTATION_CURRENT,
  CR_CLIENT_PROFILE_ON_FILE,
  CR_MEDICATION_LIST_ON_FILE,
  CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED,
  CR_SIGNIFICANT_EVENTS_DOCUMENTED,
  ISP_VALIDITY_DAYS,
  SUPERVISORY_VISIT_VALIDITY_DAYS,
} from "@/lib/clientReadiness/constants";
import { buildDocumentStoragePath, uploadDocumentBytes, validateDocumentFile } from "@/lib/workforce/storage";

// Requirements whose evidence is genuinely event-triggered/non-expiring
// (satisfied by continued existence, invalidated only by a real
// replacement — see the requirement matrix). Every other document-backed
// requirement here gets a calendar expiration at write time.
const NON_EXPIRING_DOCUMENT_REQUIREMENTS = new Set([CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED, CR_BILLING_AGREEMENT_ON_FILE]);

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function currentActor(): Promise<{ label: string; role: AuthRole | null } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, role: profile.role ?? null };
}

async function requirePermission(): Promise<{ actor: { label: string; role: AuthRole | null } } | { error: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to do this." };
  if (!canAccessResidentEvidence(actor.role)) {
    return { error: "You do not have permission to manage this client's readiness evidence." };
  }
  return { actor };
}

async function findMostRecentActiveEvidenceId(residentId: string, requirementId: string): Promise<string | null> {
  const existing = await getPersonEvidenceForSubject("resident", residentId);
  const prior = existing
    .filter((e) => e.requirement_id === requirementId && e.lifecycle_status === "active")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  return prior?.id ?? null;
}

// Generic document-backed evidence action — ISP, Supervisory Visit,
// Significant Event documentation, Discharge Summary. Service Agreement
// has its own action below (it may also satisfy Billing, per Decision 7).
export async function recordClientReadinessDocumentEvidenceAction(formData: FormData) {
  const permission = await requirePermission();
  if ("error" in permission) return permission;
  const { actor } = permission;

  const residentId = String(formData.get("residentId") ?? "");
  const requirementCode = String(formData.get("requirementCode") ?? "");
  const effectiveDate = (formData.get("effectiveDate") as string | null) || new Date().toISOString().slice(0, 10);
  const notes = (formData.get("notes") as string | null) || null;
  const file = formData.get("file");

  if (!residentId || !requirementCode) return { error: "A resident and requirement are required." };
  if (!(file instanceof File) || file.size === 0) return { error: "A document is required." };

  const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
  if (!validation.ok) return { error: validation.error };

  const requirement = await getRequirementByCode(requirementCode);
  if (!requirement) return { error: `Unknown requirement: ${requirementCode}` };

  const documentId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath({
    subjectType: "resident",
    subjectId: residentId,
    documentType: requirementCode.toLowerCase(),
    documentId,
  });
  const bytes = await file.arrayBuffer();
  const uploadResult = await uploadDocumentBytes(storagePath, bytes);
  if (uploadResult.error) return { error: uploadResult.error };

  const documentResult = await createPersonDocument({
    subjectType: "resident",
    subjectId: residentId,
    storageBucket: "person-documents",
    storagePath,
    originalFilename: file.name,
    documentType: requirementCode.toLowerCase(),
    mimeType: file.type,
    fileSizeBytes: file.size,
    documentDate: effectiveDate,
    uploadedBy: actor.label,
    checksum: null,
  });
  if (documentResult.error || !documentResult.document) {
    return { error: documentResult.error ?? "Could not save the supporting document." };
  }

  // Significant Events is never a supersession chain — each recorded
  // event is its own independent, permanent fact (evaluateSignificantEvents
  // in clientReadinessReadiness.ts requires EVERY recorded event to have
  // documentation, not just the most recent one). Every other document-
  // backed requirement here is a single current artifact, so a new upload
  // correctly supersedes the prior one.
  const isSignificantEvent = requirementCode === CR_SIGNIFICANT_EVENTS_DOCUMENTED;

  const nonExpiring = isSignificantEvent || NON_EXPIRING_DOCUMENT_REQUIREMENTS.has(requirementCode);
  const expirationDate = nonExpiring
    ? null
    : addDays(
        new Date(effectiveDate),
        requirementCode === "CR_SUPERVISORY_VISIT_RECORDED" ? SUPERVISORY_VISIT_VALIDITY_DAYS : ISP_VALIDITY_DAYS
      );

  const supersedesEvidenceId = isSignificantEvent ? null : await findMostRecentActiveEvidenceId(residentId, requirement.id);

  return recordDocumentEvidence({
    residentId,
    requirementId: requirement.id,
    documentId: documentResult.document.id,
    effectiveDate,
    expirationDate,
    supersedesEvidenceId,
    actor: actor.label,
    notes,
  });
}

// Service Agreement — may also satisfy Billing / Payment Authorization
// from the same document (Decision 7): one upload, one document row, and
// (when checked) a second, independent evidence row for Billing pointing
// at the same document_id, linked to the Service Agreement evidence via
// requirement_evidence_links for audit traceability. Never a duplicate
// upload. Each evidence row still satisfies its own requirement through
// the standard, evaluator-read requirement_id — requirement_evidence_links
// records the relationship for audit clarity, it is not what makes Billing
// evaluate as satisfied.
export async function recordServiceAgreementEvidenceAction(formData: FormData) {
  const permission = await requirePermission();
  if ("error" in permission) return permission;
  const { actor } = permission;

  const residentId = String(formData.get("residentId") ?? "");
  const effectiveDate = (formData.get("effectiveDate") as string | null) || new Date().toISOString().slice(0, 10);
  const notes = (formData.get("notes") as string | null) || null;
  const alsoSatisfiesBilling = formData.get("alsoSatisfiesBilling") === "true";
  const file = formData.get("file");

  if (!residentId) return { error: "A resident is required." };
  if (!(file instanceof File) || file.size === 0) return { error: "A document is required." };

  const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
  if (!validation.ok) return { error: validation.error };

  const serviceAgreementRequirement = await getRequirementByCode(CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED);
  if (!serviceAgreementRequirement) return { error: "Service Agreement requirement not found." };

  const documentId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath({
    subjectType: "resident",
    subjectId: residentId,
    documentType: "service_agreement",
    documentId,
  });
  const bytes = await file.arrayBuffer();
  const uploadResult = await uploadDocumentBytes(storagePath, bytes);
  if (uploadResult.error) return { error: uploadResult.error };

  const documentResult = await createPersonDocument({
    subjectType: "resident",
    subjectId: residentId,
    storageBucket: "person-documents",
    storagePath,
    originalFilename: file.name,
    documentType: "service_agreement",
    mimeType: file.type,
    fileSizeBytes: file.size,
    documentDate: effectiveDate,
    uploadedBy: actor.label,
    checksum: null,
  });
  if (documentResult.error || !documentResult.document) {
    return { error: documentResult.error ?? "Could not save the Service Agreement document." };
  }

  const priorServiceAgreementEvidenceId = await findMostRecentActiveEvidenceId(residentId, serviceAgreementRequirement.id);
  const serviceAgreementResult = await recordDocumentEvidence({
    residentId,
    requirementId: serviceAgreementRequirement.id,
    documentId: documentResult.document.id,
    effectiveDate,
    expirationDate: null,
    supersedesEvidenceId: priorServiceAgreementEvidenceId,
    actor: actor.label,
    notes,
  });
  if (serviceAgreementResult.error || !serviceAgreementResult.evidence) {
    return { error: serviceAgreementResult.error ?? "Could not record Service Agreement evidence." };
  }

  if (!alsoSatisfiesBilling) {
    return { evidence: serviceAgreementResult.evidence };
  }

  const billingRequirement = await getRequirementByCode(CR_BILLING_AGREEMENT_ON_FILE);
  if (!billingRequirement) {
    return { evidence: serviceAgreementResult.evidence, warning: "Service Agreement recorded; Billing requirement not found to link." };
  }

  const priorBillingEvidenceId = await findMostRecentActiveEvidenceId(residentId, billingRequirement.id);
  const billingResult = await recordDocumentEvidence({
    residentId,
    requirementId: billingRequirement.id,
    documentId: documentResult.document.id,
    effectiveDate,
    expirationDate: null,
    supersedesEvidenceId: priorBillingEvidenceId,
    actor: actor.label,
    notes: notes ?? "Billing terms included in the Service Agreement.",
  });
  if (billingResult.error || !billingResult.evidence) {
    return {
      evidence: serviceAgreementResult.evidence,
      warning: `Service Agreement recorded, but Billing could not be linked: ${billingResult.error}`,
    };
  }

  await linkEvidenceToRequirement({
    requirementId: billingRequirement.id,
    evidenceId: serviceAgreementResult.evidence.id,
    rationale: "Billing terms are included in this Service Agreement document — one artifact, two governed requirements.",
    linkedBy: actor.label,
  });

  return { evidence: serviceAgreementResult.evidence };
}

export async function recordMedicationListAttestationAction(input: {
  residentId: string;
  outcome: "present" | "not_applicable";
  notes: string | null;
}) {
  const permission = await requirePermission();
  if ("error" in permission) return permission;
  const { actor } = permission;

  const requirement = await getRequirementByCode(CR_MEDICATION_LIST_ON_FILE);
  if (!requirement) return { error: "Medication List requirement not found." };

  return recordMedicationListAttestation({
    residentId: input.residentId,
    requirementId: requirement.id,
    outcome: input.outcome,
    actor: actor.label,
    notes: input.notes,
  });
}

export async function recordCareDocumentationAttestationAction(input: {
  residentId: string;
  verifiedThroughDate: string;
  notes: string | null;
}) {
  const permission = await requirePermission();
  if ("error" in permission) return permission;
  const { actor } = permission;

  const requirement = await getRequirementByCode(CR_CARE_DOCUMENTATION_CURRENT);
  if (!requirement) return { error: "Care Documentation requirement not found." };
  if (!input.verifiedThroughDate) return { error: "A verified-through date is required." };

  return recordCareDocumentationAttestation({
    residentId: input.residentId,
    requirementId: requirement.id,
    verifiedThroughDate: input.verifiedThroughDate,
    actor: actor.label,
    notes: input.notes,
  });
}

export async function recordGuardianNoneAttestationAction(input: { residentId: string; notes: string | null }) {
  const permission = await requirePermission();
  if ("error" in permission) return permission;
  const { actor } = permission;

  const requirement = await getRequirementByCode(CR_CLIENT_PROFILE_ON_FILE);
  if (!requirement) return { error: "Client Profile requirement not found." };

  return recordGuardianNoneAttestation({
    residentId: input.residentId,
    requirementId: requirement.id,
    actor: actor.label,
    notes: input.notes,
  });
}
