"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canManageCorrectiveActions, canRunAuditDrill } from "@/lib/compliance/permissions";
import { getAgencyBySlug } from "@/lib/data/agencies";
import { recordComplianceActivity } from "@/lib/data/complianceActivity";
import { syncCorrectiveAction } from "@/lib/data/complianceCorrectiveActions";
import {
  completeEmergencyPreparednessReview,
  startEmergencyPreparednessReview,
} from "@/lib/data/emergencyPreparednessReviews";
import { createPersonDocument } from "@/lib/data/personDocuments";
import { getRequirementByCode } from "@/lib/data/personRequirements";
import {
  recordEmergencyPreparednessDrillOrResponse,
  recordEmergencyPreparednessEvidence,
  recordEmergencyPreparednessImprovement,
  recordEmergencyPreparednessRequirementFinding,
} from "@/lib/emergencyPreparedness/emergencyPreparednessReviews";
import { SERVE_CAREGIVING_AGENCY_SLUG } from "@/lib/emergencyPreparedness/constants";
import { isEmergencyPreparednessSatisfactionContext } from "@/lib/emergencyPreparedness/satisfactionContext";
import { buildDocumentStoragePath, uploadDocumentBytes, validateDocumentFile } from "@/lib/workforce/storage";
import type { ComplianceCorrectiveActionPriority, ComplianceCorrectiveActionType, EmergencyPreparednessReviewOutcome } from "@/lib/supabase/types";

async function currentActor(): Promise<{ label: string; role: string | null } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, role: profile.role ?? null };
}

async function requireAgency(): Promise<{ id: string } | { error: string }> {
  const agency = await getAgencyBySlug(SERVE_CAREGIVING_AGENCY_SLUG);
  if (!agency) return { error: "Emergency Preparedness is not yet configured — no agency record found." };
  return agency;
}

export async function startEmergencyPreparednessReviewAction() {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to start an Emergency Preparedness review." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to start an Emergency Preparedness review." };
  }

  return startEmergencyPreparednessReview(actor.label);
}

// Records one requirement finding — a FormData action (not a plain object)
// since 'update_needed' may carry a new supporting document, matching
// lib/actions/workforce.ts's submitHumanAttestation convention exactly (the
// same buildDocumentStoragePath/uploadDocumentBytes/createPersonDocument
// primitives, no parallel upload path).
export async function recordEmergencyPreparednessRequirementFindingAction(formData: FormData) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record a review finding." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to record an Emergency Preparedness review finding." };
  }

  const agency = await requireAgency();
  if ("error" in agency) return agency;

  const reviewId = String(formData.get("reviewId") ?? "");
  const requirementCode = String(formData.get("requirementCode") ?? "");
  const outcome = String(formData.get("outcome") ?? "") as EmergencyPreparednessReviewOutcome;
  const notes = (formData.get("notes") as string | null) || null;
  const file = formData.get("file");

  if (!reviewId || !requirementCode || !outcome) {
    return { error: "A review, requirement, and outcome are required." };
  }

  const requirement = await getRequirementByCode(requirementCode);
  if (!requirement) return { error: `Unknown requirement: ${requirementCode}` };

  let newDocumentId: string | null = null;
  if (outcome === "update_needed") {
    if (!(file instanceof File) || file.size === 0) {
      return { error: "A new document is required to record an update." };
    }
    const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
    if (!validation.ok) return { error: validation.error };

    const documentId = crypto.randomUUID();
    const storagePath = buildDocumentStoragePath({
      subjectType: "agency",
      subjectId: agency.id,
      documentType: requirementCode.toLowerCase(),
      documentId,
    });
    const bytes = await file.arrayBuffer();
    const uploadResult = await uploadDocumentBytes(storagePath, bytes);
    if (uploadResult.error) return { error: uploadResult.error };

    const documentResult = await createPersonDocument({
      subjectType: "agency",
      subjectId: agency.id,
      storageBucket: "person-documents",
      storagePath,
      originalFilename: file.name,
      documentType: requirementCode.toLowerCase(),
      mimeType: file.type,
      fileSizeBytes: file.size,
      documentDate: new Date().toISOString().slice(0, 10),
      uploadedBy: actor.label,
      checksum: null,
    });
    if (documentResult.error || !documentResult.document) {
      return { error: documentResult.error ?? "Could not save the supporting document." };
    }
    newDocumentId = documentResult.document.id;
  }

  return recordEmergencyPreparednessRequirementFinding({
    reviewId,
    agencyId: agency.id,
    requirement,
    outcome,
    notes,
    actor: actor.label,
    newDocumentId,
  });
}

// Direct, review-independent evidence recording for a requirement's own
// detail panel — "Upload Evidence" / "Record/Verify Designation" — always
// available, never gated behind an in-progress Annual Review. Same
// optional-file FormData shape as the requirement-finding action above.
export async function recordEmergencyPreparednessEvidenceAction(formData: FormData) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record evidence." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to record Emergency Preparedness evidence." };
  }

  const agency = await requireAgency();
  if ("error" in agency) return agency;

  const requirementCode = String(formData.get("requirementCode") ?? "");
  const effectiveDate = (formData.get("effectiveDate") as string | null) || new Date().toISOString().slice(0, 10);
  const notes = (formData.get("notes") as string | null) || null;
  const file = formData.get("file");

  if (!requirementCode) return { error: "A requirement is required." };
  const requirement = await getRequirementByCode(requirementCode);
  if (!requirement) return { error: `Unknown requirement: ${requirementCode}` };

  let documentId: string | null = null;
  if (file instanceof File && file.size > 0) {
    const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
    if (!validation.ok) return { error: validation.error };

    const newDocumentId = crypto.randomUUID();
    const storagePath = buildDocumentStoragePath({
      subjectType: "agency",
      subjectId: agency.id,
      documentType: requirementCode.toLowerCase(),
      documentId: newDocumentId,
    });
    const bytes = await file.arrayBuffer();
    const uploadResult = await uploadDocumentBytes(storagePath, bytes);
    if (uploadResult.error) return { error: uploadResult.error };

    const documentResult = await createPersonDocument({
      subjectType: "agency",
      subjectId: agency.id,
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
    documentId = documentResult.document.id;
  }

  return recordEmergencyPreparednessEvidence({
    agencyId: agency.id,
    requirement,
    documentId,
    effectiveDate,
    notes,
    actor: actor.label,
  });
}

export async function recordEmergencyPreparednessImprovementAction(input: {
  reviewId: string;
  description: string;
  notes: string | null;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to suggest an improvement." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to record an Emergency Preparedness review item." };
  }
  if (!input.description || input.description.trim().length === 0) {
    return { error: "A description is required." };
  }

  return recordEmergencyPreparednessImprovement({ ...input, actor: actor.label });
}

export async function completeEmergencyPreparednessReviewAction(input: { reviewId: string; summary: string | null }) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to complete an Emergency Preparedness review." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to complete an Emergency Preparedness review." };
  }

  return completeEmergencyPreparednessReview({ reviewId: input.reviewId, summary: input.summary, actor: actor.label });
}

// EP_ANNUAL_RESPONSE_DRILL's own evidence — recordable any time, inside or
// outside a review. FormData for the same optional-file reason as the
// requirement-finding action above.
export async function recordEmergencyPreparednessDrillOrResponseAction(formData: FormData) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record a drill or response." };
  if (!canRunAuditDrill(actor.role)) {
    return { error: "You do not have permission to record an Emergency Preparedness drill or response." };
  }

  const agency = await requireAgency();
  if ("error" in agency) return agency;

  const kind = String(formData.get("kind") ?? "");
  const occurredAt = String(formData.get("occurredAt") ?? "");
  const notes = (formData.get("notes") as string | null) || null;
  const file = formData.get("file");

  if (!isEmergencyPreparednessSatisfactionContext(kind) || (kind !== "planned_drill" && kind !== "actual_emergency_response")) {
    return { error: "A valid drill or response type is required." };
  }
  if (!occurredAt) return { error: "A date is required." };

  const requirement = await getRequirementByCode("EP_ANNUAL_RESPONSE_DRILL");
  if (!requirement) return { error: "EP_ANNUAL_RESPONSE_DRILL requirement not found." };

  let documentId: string | null = null;
  if (file instanceof File && file.size > 0) {
    const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
    if (!validation.ok) return { error: validation.error };

    const newDocumentId = crypto.randomUUID();
    const storagePath = buildDocumentStoragePath({
      subjectType: "agency",
      subjectId: agency.id,
      documentType: "ep_annual_response_drill",
      documentId: newDocumentId,
    });
    const bytes = await file.arrayBuffer();
    const uploadResult = await uploadDocumentBytes(storagePath, bytes);
    if (uploadResult.error) return { error: uploadResult.error };

    const documentResult = await createPersonDocument({
      subjectType: "agency",
      subjectId: agency.id,
      storageBucket: "person-documents",
      storagePath,
      originalFilename: file.name,
      documentType: "ep_annual_response_drill",
      mimeType: file.type,
      fileSizeBytes: file.size,
      documentDate: occurredAt,
      uploadedBy: actor.label,
      checksum: null,
    });
    if (documentResult.error || !documentResult.document) {
      return { error: documentResult.error ?? "Could not save the supporting document." };
    }
    documentId = documentResult.document.id;
  }

  return recordEmergencyPreparednessDrillOrResponse({
    agencyId: agency.id,
    requirement,
    kind,
    occurredAt,
    documentId,
    notes,
    actor: actor.label,
  });
}

// A real triggering-event record for EP_HHS_NOTIFICATION's applicability —
// never evidence-absence. Deliberately narrow: only the two event types
// compliance_activity.event_type was widened for.
export async function recordAgencyOperationalEventAction(input: {
  eventType: "agency_temporary_relocation" | "agency_service_area_expansion";
  eventTitle: string;
  eventDescription: string | null;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to record an operational event." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to record an operational event." };
  }
  if (!input.eventTitle || input.eventTitle.trim().length === 0) {
    return { error: "A title is required." };
  }

  const agency = await requireAgency();
  if ("error" in agency) return agency;

  return recordComplianceActivity({
    subjectType: "agency",
    subjectId: agency.id,
    eventType: input.eventType,
    eventTitle: input.eventTitle,
    eventDescription: input.eventDescription,
    source: "Serve OS",
    createdBy: actor.label,
  });
}

// Governance Connective Slice v0.1 — reviewItemId is optional so this
// function's existing callers (if any predate this slice) keep working
// unchanged, but the RequirementFindingForm confirm-step below always
// supplies it: requirement_id alone tells you *what expectation* is
// involved, not *which Annual Review or finding* raised the action. Two
// review cycles months apart could each flag the same requirement — only
// the review item id disambiguates which one this action came from.
export async function createEmergencyPreparednessCorrectiveActionAction(input: {
  requirementId: string;
  actionType: ComplianceCorrectiveActionType;
  title: string;
  reason: string;
  priority: ComplianceCorrectiveActionPriority;
  dueAt: string | null;
  reviewItemId?: string;
}) {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to create a corrective action." };
  if (!canManageCorrectiveActions(actor.role)) {
    return { error: "You do not have permission to create a corrective action." };
  }

  const agency = await requireAgency();
  if ("error" in agency) return agency;

  return syncCorrectiveAction({
    subjectType: "agency",
    subjectId: agency.id,
    requirementId: input.requirementId,
    domain: "emergency_preparedness",
    actionType: input.actionType,
    title: input.title,
    reason: input.reason,
    priority: input.priority,
    dueAt: input.dueAt,
    actor: actor.label,
    sourceReviewItemId: input.reviewItemId,
  });
}
