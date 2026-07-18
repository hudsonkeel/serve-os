"use server";

import {
  findPossibleDuplicateRelationship,
  findResidentMatchCandidates,
  getIntakeProcessingRecordById,
  getUnprocessedWebsiteIntakeSubmissions,
  getWebsiteIntakeSubmissionById,
  processWebsiteIntakeSubmission,
  recordIntakeProcessingFailure,
  type ProcessWebsiteIntakeInput,
} from "@/lib/data/intakeEngine";
import { normalizeWebsiteIntakeSubmission } from "@/lib/intake/envelope";
import { classifyIntakeSubmission } from "@/lib/intake/classification";
import { buildFollowUpAgenda, reasonCodesToMissingFieldLabels } from "@/lib/intake/contactReadiness";
import { matchResident } from "@/lib/intake/residentMatching";
import { categorizeTiming, determinePriorityRule } from "@/lib/intake/priority";
import { mapSupportTypeToServiceOpportunity } from "@/lib/intake/serviceOpportunityMapping";
import { joinName } from "@/lib/intake/nameUtils";
import type { IntakeEnvelope } from "@/lib/intake/types";
import type { IntakeProcessingRecord } from "@/lib/supabase/types";

// The Serve Intake Intelligence Engine's server-action entry points — see
// docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md. `processIntakeSubmission`
// is the ONLY code path in serve-os permitted to translate a website
// intake submission into an operational record (Part 1's canonical-
// responsibility rule). Every downstream write goes through
// process_website_intake_submission()/record_intake_processing_failure()
// — this file computes the decision (classification, matching, mapping),
// never performs the write itself.

const INTAKE_OWNER_LABEL = process.env.SERVE_INTAKE_OWNER_LABEL || null;

function nextActionTitleFor(envelope: IntakeEnvelope, classification: string): string {
  if (classification === "resident_prospect" || classification === "external_prospect") {
    return `Contact ${envelope.primaryContact.fullName ?? "family"}`;
  }
  if (classification === "professional_relationship") {
    return envelope.referralContext.reason?.toLowerCase().includes("patient")
      ? `Contact referred family (via ${envelope.referralContext.organization ?? "referral"})`
      : `Follow up with referral source (${envelope.referralContext.organization ?? envelope.primaryContact.fullName ?? "referral"})`;
  }
  return "Review Website Inquiry";
}

async function buildDecidedInput(
  envelope: IntakeEnvelope,
  force: boolean,
  // Staff resolution actions (Part 24) confirm a DIFFERENT classification
  // than automatic processing would have reached (e.g. "needs_review" ->
  // "resident_prospect" once a Resident is picked). Every downstream
  // field below (displayName, actionTitle, priority, service-location
  // fields, ...) branches on `classification` — so the override must be
  // threaded in *before* that branching runs, not shallow-merged onto the
  // result afterward. A prior version of this function did the latter,
  // which left `displayName: null` for a resolution's overridden
  // classification (still branching on the stale, un-overridden value)
  // and caused create_relationship()'s NOT NULL constraint to fail
  // silently inside the transaction — caught during live verification.
  classificationOverride?: {
    classification: ProcessWebsiteIntakeInput["classification"];
    residentId?: string | null;
    extraReasonCodes?: string[];
  }
): Promise<ProcessWebsiteIntakeInput> {
  const isCareInquiry = envelope.intakeType === "family_care_inquiry" || envelope.intakeType === "outside_service_area";

  const nameForMatching = envelope.primaryContact.isProspectiveClient
    ? envelope.primaryContact.fullName
    : joinName(envelope.prospectiveClient.firstName, envelope.prospectiveClient.lastName);

  const residentCandidates = isCareInquiry ? await findResidentMatchCandidates(nameForMatching) : [];
  const residentMatch = isCareInquiry
    ? matchResident({ fullName: nameForMatching }, residentCandidates)
    : null;

  const duplicateRelationshipId = await findPossibleDuplicateRelationship(
    envelope.primaryContact.phone,
    envelope.primaryContact.email
  );

  const classificationResult = classifyIntakeSubmission({
    envelope,
    residentMatch,
    hasPossibleDuplicateRelationship: !!duplicateRelationshipId,
  });

  const timingCategory = categorizeTiming(envelope.timing.startTiming);
  const priorityRule = determinePriorityRule(timingCategory);
  const serviceOpportunity = mapSupportTypeToServiceOpportunity(
    envelope.serviceNeeds.supportType,
    envelope.serviceNeeds.careNeeds
  );

  const classification = classificationOverride?.classification ?? classificationResult.classification;
  const isOperational = ["resident_prospect", "external_prospect", "professional_relationship"].includes(
    classification
  );

  const relationshipType =
    classification === "resident_prospect"
      ? "resident_prospect"
      : classification === "external_prospect"
        ? "external_prospect"
        : classification === "professional_relationship"
          ? "referral_source"
          : null;

  // A Contact-Ready care inquiry frequently has no confirmed prospective-client identity
  // yet (Part 4) — the display name must stay truthful rather than inventing one. When the
  // care recipient's identity IS known, the existing last-name-based "Family Inquiry" label
  // is kept (better search/scan behavior on the board); otherwise a plain contact-based
  // label is used instead of ever falling back to a placeholder.
  const hasProspectiveClientIdentity = !!(envelope.prospectiveClient.firstName || envelope.prospectiveClient.lastName);
  const displayName = isOperational
    ? classification === "professional_relationship"
      ? `${envelope.referralContext.organization ?? envelope.primaryContact.fullName ?? "Professional"} Referral`
      : hasProspectiveClientIdentity
        ? `${envelope.primaryContact.lastName ?? envelope.primaryContact.fullName} Family Inquiry`
        : `${envelope.primaryContact.fullName} — Care Inquiry`
    : null;

  const actionTitle = isOperational ? nextActionTitleFor(envelope, classification) : null;

  // Deterministic follow-up agenda (Part 7/8) — built only for care inquiries, derived from
  // the same reason codes persisted on the processing record (no separate mutable field).
  const isCareInquiryClassification = classification === "resident_prospect" || classification === "external_prospect";
  const actionDetail =
    isOperational && isCareInquiryClassification && envelope.primaryContact.fullName
      ? buildFollowUpAgenda(
          envelope.primaryContact.fullName,
          reasonCodesToMissingFieldLabels(classificationResult.reasonCodes)
        )
      : null;

  const intakeContextParts = [
    envelope.careContext.message ? `Submitted message:\n${envelope.careContext.message}` : null,
    envelope.referralContext.referralDetails ? `Referral details:\n${envelope.referralContext.referralDetails}` : null,
  ].filter(Boolean);

  const residentId =
    classification === "resident_prospect"
      ? classificationOverride?.residentId ?? residentMatch?.residentId ?? null
      : null;

  const serviceAddressLine1 = classification === "external_prospect" ? envelope.serviceLocation.addressLine1 : null;
  const serviceAddressLine2: string | null = null;
  const serviceCity = classification === "external_prospect" ? envelope.serviceLocation.city : null;
  const serviceState = classification === "external_prospect" ? envelope.serviceLocation.state : null;
  const servicePostalCode = classification === "external_prospect" ? envelope.serviceLocation.zip : null;

  return {
    submissionId: envelope.sourceSubmissionId,
    classification,
    confidenceScore: classificationOverride ? 100 : classificationResult.confidenceScore,
    confidenceBand: classificationOverride ? "automatic" : classificationResult.confidenceBand,
    reasonCodes: [...classificationResult.reasonCodes, ...(classificationOverride?.extraReasonCodes ?? [])],
    normalizedEnvelope: envelope as unknown as Record<string, unknown>,
    existingRelationshipId: isOperational ? duplicateRelationshipId : null,
    relationshipType,
    displayName,
    residentId,
    prospectiveClientFirstName: envelope.prospectiveClient.firstName,
    prospectiveClientLastName: envelope.prospectiveClient.lastName,
    prospectiveClientPreferredName: null,
    prospectiveClientPhone: envelope.prospectiveClient.phone,
    prospectiveClientEmail: envelope.prospectiveClient.email,
    primaryContactName: envelope.primaryContact.fullName,
    primaryContactRelationship: envelope.primaryContact.relationshipToProspectiveClient,
    primaryContactPhone: envelope.primaryContact.phone,
    primaryContactEmail: envelope.primaryContact.email,
    primaryContactIsProspectiveClient: envelope.primaryContact.isProspectiveClient,
    organizationName: envelope.referralContext.organization,
    ownerLabel: INTAKE_OWNER_LABEL,
    priority: isOperational ? priorityRule.priority : null,
    sourceLabel: `Website (${envelope.sourceFormType ?? envelope.intakeType})`,
    serviceAddressLine1,
    serviceAddressLine2,
    serviceCity,
    serviceState,
    servicePostalCode,
    serviceResidenceType: null,
    serviceSummary: isCareInquiry ? serviceOpportunity.serviceSummary : null,
    intakeContextNote: intakeContextParts.length > 0 ? intakeContextParts.join("\n\n") : null,
    actionTitle,
    actionDetail,
    actionType: "follow_up",
    actionDueAt: isOperational ? `${priorityRule.dueDateCentral}T00:00:00.000Z` : null,
    recruitingRole: envelope.employmentContext.roleInterest,
    recruitingFirstName: envelope.primaryContact.firstName,
    recruitingLastName: envelope.primaryContact.lastName,
    recruitingPhone: envelope.primaryContact.phone,
    recruitingEmail: envelope.primaryContact.email,
    recruitingZip: envelope.serviceLocation.zip,
    recruitingCityState: envelope.employmentContext.cityState,
    recruitingLinkedin: envelope.employmentContext.linkedin,
    recruitingResumeFilename: envelope.employmentContext.resumeFilename,
    recruitingMessage: envelope.careContext.message,
    force,
  };
}

export async function processIntakeSubmission(
  submissionId: string
): Promise<{ record?: IntakeProcessingRecord; error?: string }> {
  const submission = await getWebsiteIntakeSubmissionById(submissionId);
  if (!submission) return { error: "Submission not found." };

  try {
    const envelope = normalizeWebsiteIntakeSubmission(submission);
    const decided = await buildDecidedInput(envelope, false);
    const result = await processWebsiteIntakeSubmission(decided);

    if (result.error) {
      await recordIntakeProcessingFailure(submissionId, submission.intake_type, result.error);
      return { error: result.error };
    }

    return { record: result.record };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error.";
    await recordIntakeProcessingFailure(submissionId, submission.intake_type, message);
    return { error: message };
  }
}

export async function processAllUnprocessedIntakeSubmissions(): Promise<{
  processed: number;
  failed: number;
}> {
  const submissions = await getUnprocessedWebsiteIntakeSubmissions();
  let processed = 0;
  let failed = 0;

  for (const submission of submissions) {
    const result = await processIntakeSubmission(submission.id);
    if (result.error) failed += 1;
    else processed += 1;
  }

  return { processed, failed };
}

export async function retryFailedIntakeSubmission(
  submissionId: string
): Promise<{ record?: IntakeProcessingRecord; error?: string }> {
  return processIntakeSubmission(submissionId);
}

// ─── Needs Resolution resolution actions ────────────────────────────────
// Every remaining Needs Resolution trigger (missing name, missing contact method,
// multiple resident matches, conflicting location signals, unsupported submission type,
// possible duplicate) is a genuine blocker per lib/intake/classification.ts — completing an
// External Prospect's service location is no longer one of them (Contact-Ready external
// inquiries are created immediately regardless of address completeness), so that resolution
// action was removed rather than left unreachable.

export async function linkExistingResidentForReview(
  processingRecordId: string,
  residentId: string
): Promise<{ error?: string }> {
  const record = await getIntakeProcessingRecordById(processingRecordId);
  if (!record) return { error: "Processing record not found." };
  const submission = await getWebsiteIntakeSubmissionById(record.source_submission_id);
  if (!submission) return { error: "Original submission not found." };

  const envelope = normalizeWebsiteIntakeSubmission(submission);
  const decided = await buildDecidedInput(envelope, true, {
    classification: "resident_prospect",
    residentId,
    extraReasonCodes: ["STAFF_CONFIRMED_RESIDENT_MATCH"],
  });
  const result = await processWebsiteIntakeSubmission(decided);
  return { error: result.error };
}

export async function dismissIntakeAsNotQualified(
  processingRecordId: string,
  reason: string
): Promise<{ error?: string }> {
  const record = await getIntakeProcessingRecordById(processingRecordId);
  if (!record) return { error: "Processing record not found." };
  const submission = await getWebsiteIntakeSubmissionById(record.source_submission_id);
  if (!submission) return { error: "Original submission not found." };

  const envelope = normalizeWebsiteIntakeSubmission(submission);
  const decided = await buildDecidedInput(envelope, true, {
    classification: "not_qualified",
    extraReasonCodes: ["STAFF_DISMISSED", `DISMISSAL_REASON: ${reason}`],
  });
  const result = await processWebsiteIntakeSubmission(decided);
  return { error: result.error };
}
