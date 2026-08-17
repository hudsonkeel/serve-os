"use server";

// Resident document/evidence — the Audit Readiness Phase 2 "client
// evidence lives with clients" deliverable. Every primitive here is
// reused unchanged from the platform-owned, already-generic layer: file
// validation/storage (lib/workforce/storage.ts — despite its path, its
// API has always been subject-type-generic), document metadata
// (lib/data/personDocuments.ts), and evidence/verification
// (lib/data/personEvidence.ts). Nothing here duplicates that
// infrastructure; this file only adds the resident-domain call sites,
// permission gate, and activity logging (resident_timeline — this
// resident's own existing timeline, not a new or Audit-Readiness-owned
// table).
//
// person_evidence.requirement_id is NOT NULL — an evidence row cannot
// exist without a real requirement. No resident-facing requirement is
// seeded yet (Emergency Preparedness/Client File Readiness are still
// pending review — see the Phase 1 draft and its 3 open questions), so
// requirementCode is optional here: every upload always creates a
// person_documents row; only when a valid requirementCode is supplied
// does it also create a person_evidence row linking to it. The moment a
// resident-facing requirement exists, this same code path starts
// producing real evidence — no redesign required.
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canAccessResidentEvidence } from "@/lib/auth/permissions";
import {
  buildDocumentStoragePath,
  getSignedDocumentUrl,
  uploadDocumentBytes,
  validateDocumentFile,
} from "@/lib/workforce/storage";
import { createPersonDocument, getPersonDocumentById, supersedePersonDocument } from "@/lib/data/personDocuments";
import { createPersonEvidence } from "@/lib/data/personEvidence";
import { getRequirementByCode } from "@/lib/data/personRequirements";
import { logResidentDocumentSuperseded, logResidentDocumentUploaded } from "@/lib/data/residentTimeline";
import { SUBJECT_TYPE_RESIDENT } from "@/lib/supabase/types";
import type { AuthRole } from "@/lib/auth/constants";

async function currentActor(): Promise<{ label: string; role: AuthRole | null } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, role: profile.role ?? null };
}

export async function uploadResidentDocument(formData: FormData): Promise<{ error?: string; documentId?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to upload a document." };
  if (!canAccessResidentEvidence(actor.role)) {
    return { error: "You do not have permission to upload resident documents." };
  }

  const residentId = String(formData.get("residentId") ?? "");
  const documentType = String(formData.get("documentType") ?? "");
  const documentDate = (formData.get("documentDate") as string | null) || null;
  const requirementCode = (formData.get("requirementCode") as string | null) || null;
  const file = formData.get("file");

  if (!residentId || !documentType) {
    return { error: "Resident and document type are required." };
  }
  if (!(file instanceof File)) {
    return { error: "No file provided." };
  }

  const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
  if (!validation.ok) return { error: validation.error };

  const documentId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath({
    subjectType: SUBJECT_TYPE_RESIDENT,
    subjectId: residentId,
    documentType,
    documentId,
  });

  const bytes = await file.arrayBuffer();
  const uploadResult = await uploadDocumentBytes(storagePath, bytes);
  if (uploadResult.error) return { error: uploadResult.error };

  const documentResult = await createPersonDocument({
    subjectType: SUBJECT_TYPE_RESIDENT,
    subjectId: residentId,
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

  // Optional — see the file header. Most uploads today will not supply a
  // requirementCode, since no resident-facing requirement is seeded yet.
  if (requirementCode) {
    const requirement = await getRequirementByCode(requirementCode);
    if (requirement) {
      const evidenceResult = await createPersonEvidence({
        subjectType: SUBJECT_TYPE_RESIDENT,
        subjectId: residentId,
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
    }
  }

  await logResidentDocumentUploaded(residentId, actor.label, documentType);

  return { documentId: documentResult.document.id };
}

// Replace-in-place — supersedes the prior document (never a destructive
// overwrite), reusing supersedePersonDocument() exactly as workforce
// already does.
export async function supersedeResidentDocument(formData: FormData): Promise<{ error?: string; documentId?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to replace a document." };
  if (!canAccessResidentEvidence(actor.role)) {
    return { error: "You do not have permission to replace resident documents." };
  }

  const residentId = String(formData.get("residentId") ?? "");
  const oldDocumentId = String(formData.get("oldDocumentId") ?? "");
  const documentType = String(formData.get("documentType") ?? "");
  const documentDate = (formData.get("documentDate") as string | null) || null;
  const file = formData.get("file");

  if (!residentId || !oldDocumentId || !documentType) {
    return { error: "Resident, prior document, and document type are required." };
  }
  if (!(file instanceof File)) {
    return { error: "No file provided." };
  }

  const oldDocument = await getPersonDocumentById(oldDocumentId);
  if (!oldDocument || oldDocument.subject_type !== SUBJECT_TYPE_RESIDENT || oldDocument.subject_id !== residentId) {
    return { error: "The document being replaced could not be found for this resident." };
  }

  const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
  if (!validation.ok) return { error: validation.error };

  const documentId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath({
    subjectType: SUBJECT_TYPE_RESIDENT,
    subjectId: residentId,
    documentType,
    documentId,
  });

  const bytes = await file.arrayBuffer();
  const uploadResult = await uploadDocumentBytes(storagePath, bytes);
  if (uploadResult.error) return { error: uploadResult.error };

  const result = await supersedePersonDocument({
    oldDocumentId,
    subjectType: SUBJECT_TYPE_RESIDENT,
    subjectId: residentId,
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
  if (result.error || !result.document) {
    return { error: result.error ?? "Could not replace document." };
  }

  await logResidentDocumentSuperseded(residentId, actor.label, documentType);

  return { documentId: result.document.id };
}

// Never a public URL — same 60-second signed-URL discipline as workforce
// documents. Re-checks the document actually belongs to this resident
// before minting a link, so a resident-evidence-permitted user can never
// fetch a different subject's document by guessing its id.
export async function getResidentDocumentDownloadUrl(input: {
  residentId: string;
  documentId: string;
}): Promise<{ url?: string; error?: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "You must be signed in to open a document." };
  if (!canAccessResidentEvidence(actor.role)) {
    return { error: "You do not have permission to view resident documents." };
  }

  const document = await getPersonDocumentById(input.documentId);
  if (!document || document.subject_type !== SUBJECT_TYPE_RESIDENT || document.subject_id !== input.residentId) {
    return { error: "Document not found for this resident." };
  }

  return getSignedDocumentUrl(document.storage_path);
}

// No "delete accidental upload" path for resident documents in this
// phase, deliberately: workforce's equivalent
// (deleteAccidentalWorkforceUpload) relies on
// delete_unverified_evidence_and_document(), an evidence-row-scoped RPC
// that only exists because workforce documents are always evidence-linked.
// A resident document uploaded without a requirement (the common case
// today — see the file header) has no evidence row for that RPC to key
// off, and hard-deleting just the person_documents row would need new
// schema-level care this phase doesn't need to take on. Replace
// (supersedeResidentDocument) is the correction path — supersession over
// destructive overwrite, per the platform's own stated preference.
