import type { WebsiteIntakeSubmission } from "@/lib/supabase/types";
import { splitFullName } from "./nameUtils.ts";
import type { IntakeEnvelope } from "./types.ts";

// Website adapter — translates the actual `website_intake_submissions`
// row shape (see docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Field
// mapping inventory," for the live field-by-field justification of every
// line below) into the source-agnostic canonical envelope. This is the
// ONLY place website-specific field names (`care-for`, `resident_last_name`,
// hyphenated form keys, etc.) may appear — the classification/confidence/
// matching engine downstream never sees them.

function readString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readResumeFilename(payload: Record<string, unknown> | null): string | null {
  const resume = payload?.resume;
  if (!resume || typeof resume !== "object") return null;
  const filename = (resume as Record<string, unknown>).filename;
  return typeof filename === "string" && filename.trim() ? filename.trim() : null;
}

// The current production/preview family-consultation and professional-
// referral forms both collect one combined "name" field, not separate
// first/last (see docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md) — the
// employment form is the one exception, collecting "full-name" instead.
function submitterName(row: WebsiteIntakeSubmission, payload: Record<string, unknown> | null): string | null {
  return row.name ?? readString(payload, "full-name") ?? readString(payload, "name");
}

// "care-for" === "myself" is the one deterministic signal the current
// family-consultation form provides for "the submitter IS the prospective
// client." Any other value (e.g. "A parent or family member") means the
// prospective client is a different, named person — but that person's
// name is not a separate field on the current form at all, so it cannot
// be deterministically extracted (see PROSPECTIVE_CLIENT_NAME_NOT_COLLECTED
// in classification.ts).
export function normalizeWebsiteIntakeSubmission(row: WebsiteIntakeSubmission): IntakeEnvelope {
  const payload = row.form_payload;
  const careFor = readString(payload, "care-for");
  const submitter = submitterName(row, payload);
  const submitterSplit = splitFullName(submitter);

  const isProspectiveClientSelf = careFor === "myself" || careFor === "self";
  const prospectiveClient = isProspectiveClientSelf
    ? { ...submitterSplit, fullName: submitter, phone: row.phone, email: row.email }
    : { firstName: null, lastName: null, fullName: null, phone: null, email: null };

  const honeypot = readString(payload, "bot-field");

  return {
    source: "website",
    sourceSubmissionId: row.id,
    sourceFormType: readString(payload, "form-name") ?? readString(payload, "form_name"),
    sourceSchemaVersion: "website-intake-v1",
    intakeType: row.intake_type,
    receivedAt: row.created_at,
    rawSubmissionReference: row.id,
    prospectiveClient,
    primaryContact: {
      ...submitterSplit,
      fullName: submitter,
      phone: row.phone,
      email: row.email,
      relationshipToProspectiveClient: careFor,
      isProspectiveClient: isProspectiveClientSelf,
    },
    careContext: {
      careFor,
      message: readString(payload, "message"),
    },
    serviceLocation: {
      zip: row.zip,
      city: row.city,
      state: null,
      addressLine1: null,
      communityOrLocationLabel: row.community,
      outsideServiceArea: row.outside_service_area,
    },
    serviceNeeds: {
      supportType: readString(payload, "support_type") ?? readString(payload, "supportType"),
      careNeeds: readString(payload, "message"),
    },
    timing: {
      startTiming: readString(payload, "start_timing") ?? readString(payload, "startTiming"),
    },
    referralContext: {
      organization: readString(payload, "organization"),
      title: readString(payload, "title"),
      reason: readString(payload, "reason"),
      referralDetails: readString(payload, "referral-details"),
    },
    employmentContext: {
      roleInterest: readString(payload, "role_interest"),
      linkedin: readString(payload, "linkedin"),
      cityState: readString(payload, "city-state"),
      resumeFilename: readResumeFilename(payload),
      leadershipInterest: readString(payload, "leadership-interest"),
    },
    metadata: {
      formPayloadKeys: payload ? Object.keys(payload) : [],
      honeypotTriggered: !!honeypot,
    },
  };
}
