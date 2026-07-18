import { createServerClient } from "@/lib/supabase/server";
import type {
  IntakeProcessingRecord,
  WebsiteIntakeSubmission,
} from "@/lib/supabase/types";
import type { ResidentMatchCandidate } from "@/lib/intake/types";

// Data layer for the Serve Intake Intelligence Engine — see
// docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md. Every write goes
// through the atomic `process_website_intake_submission()` /
// `record_intake_processing_failure()` RPCs
// (supabase/migrations/20260721000000_create_intake_intelligence_engine.sql)
// — this file never writes to `relationships`, `residents`,
// `external_clients`, or `recruiting_leads` directly.

export async function getWebsiteIntakeSubmissionById(
  id: string
): Promise<WebsiteIntakeSubmission | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("website_intake_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle<WebsiteIntakeSubmission>();

  if (error) {
    console.error("[intakeEngine:getWebsiteIntakeSubmissionById:error]", { id, message: error.message });
    return null;
  }
  return data;
}

export async function getUnprocessedWebsiteIntakeSubmissions(
  limit = 50
): Promise<WebsiteIntakeSubmission[]> {
  const supabase = createServerClient();
  const { data: processed, error: processedError } = await supabase
    .from("intake_processing_records")
    .select("source_submission_id")
    .eq("intake_source", "website")
    .neq("processing_status", "failed");

  if (processedError) {
    console.error("[intakeEngine:getUnprocessedWebsiteIntakeSubmissions:error]", processedError.message);
    return [];
  }

  const processedIds = (processed ?? []).map((r) => r.source_submission_id as string);

  let query = supabase
    .from("website_intake_submissions")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (processedIds.length > 0) {
    query = query.not("id", "in", `(${processedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[intakeEngine:getUnprocessedWebsiteIntakeSubmissions:error]", error.message);
    return [];
  }
  return (data as WebsiteIntakeSubmission[] | null) ?? [];
}

export async function getIntakeProcessingRecords(
  status?: IntakeProcessingRecord["processing_status"]
): Promise<IntakeProcessingRecord[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("intake_processing_records")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("processing_status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[intakeEngine:getIntakeProcessingRecords:error]", error.message);
    return [];
  }
  return (data as IntakeProcessingRecord[] | null) ?? [];
}

export async function getIntakeProcessingRecordById(
  id: string
): Promise<IntakeProcessingRecord | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_processing_records")
    .select("*")
    .eq("id", id)
    .maybeSingle<IntakeProcessingRecord>();

  if (error) {
    console.error("[intakeEngine:getIntakeProcessingRecordById:error]", { id, message: error.message });
    return null;
  }
  return data;
}

export interface IntakeQueueCounts {
  new: number;
  // "Processed" AND operationally Contact Ready — a Relationship and Next Action already
  // exist, awaiting a first human touch. Excludes Recruiting (not a family-care inquiry).
  contactReady: number;
  // Renamed from "needsReview": since classification.ts now only reaches `needs_review`
  // for genuine blockers (Part 2/9), this status honestly represents Needs Resolution.
  needsResolution: number;
  failed: number;
  notQualified: number;
}

export async function getIntakeQueueCounts(): Promise<IntakeQueueCounts> {
  const supabase = createServerClient();
  const [{ count: totalSubmissions }, { data: statusRows }] = await Promise.all([
    supabase.from("website_intake_submissions").select("*", { count: "exact", head: true }),
    supabase.from("intake_processing_records").select("processing_status, classification").eq("intake_source", "website"),
  ]);

  const rows = statusRows ?? [];
  const settledCount = rows.length;
  const contactReady = rows.filter((r) => r.processing_status === "processed" && r.classification !== "recruiting").length;
  const needsResolution = rows.filter((r) => r.processing_status === "needs_review").length;
  const failed = rows.filter((r) => r.processing_status === "failed").length;
  const notQualified = rows.filter((r) => r.processing_status === "not_qualified").length;

  return {
    new: Math.max(0, (totalSubmissions ?? 0) - settledCount),
    contactReady,
    needsResolution,
    failed,
    notQualified,
  };
}

// Deterministic candidate search for Resident matching (Part 6): a
// bounded, exact-ish search (name-containment, not fuzzy ranking) — the
// pure matchResident() function in lib/intake/residentMatching.ts is what
// actually decides among these candidates, never this query.
export async function findResidentMatchCandidates(
  fullName: string | null
): Promise<ResidentMatchCandidate[]> {
  if (!fullName) return [];
  const supabase = createServerClient();

  const parts = fullName.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];

  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, unit_number, community_name, external_source_key")
    .ilike("last_name", `%${lastName}%`)
    .limit(25);

  if (error) {
    console.error("[intakeEngine:findResidentMatchCandidates:error]", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    unitNumber: r.unit_number,
    communityName: r.community_name,
    externalSourceKey: r.external_source_key,
  }));
}

// Possible-duplicate check (Part 13): an active, non-closed Relationship
// already linked to this same phone or email — never a fuzzy name check
// (a common name is not evidence of the same person).
export async function findPossibleDuplicateRelationship(
  phone: string | null,
  email: string | null
): Promise<string | null> {
  if (!phone && !email) return null;
  const supabase = createServerClient();

  const filters: string[] = [];
  if (phone) filters.push(`primary_contact_phone.eq.${phone}`, `prospective_client_phone.eq.${phone}`);
  if (email) filters.push(`primary_contact_email.eq.${email}`, `prospective_client_email.eq.${email}`);
  if (filters.length === 0) return null;

  const { data, error } = await supabase
    .from("relationships")
    .select("id")
    .neq("status", "closed")
    .or(filters.join(","))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[intakeEngine:findPossibleDuplicateRelationship:error]", error.message);
    return null;
  }

  return data?.id ?? null;
}

export interface ProcessWebsiteIntakeInput {
  submissionId: string;
  classification: string;
  confidenceScore: number;
  confidenceBand: string;
  reasonCodes: string[];
  normalizedEnvelope: Record<string, unknown>;
  existingRelationshipId: string | null;
  relationshipType: string | null;
  displayName: string | null;
  residentId: string | null;
  prospectiveClientFirstName: string | null;
  prospectiveClientLastName: string | null;
  prospectiveClientPreferredName: string | null;
  prospectiveClientPhone: string | null;
  prospectiveClientEmail: string | null;
  primaryContactName: string | null;
  primaryContactRelationship: string | null;
  primaryContactPhone: string | null;
  primaryContactEmail: string | null;
  primaryContactIsProspectiveClient: boolean;
  organizationName: string | null;
  ownerLabel: string | null;
  priority: string | null;
  sourceLabel: string | null;
  serviceAddressLine1: string | null;
  serviceAddressLine2: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  servicePostalCode: string | null;
  serviceResidenceType: string | null;
  serviceSummary: string | null;
  intakeContextNote: string | null;
  actionTitle: string | null;
  actionDetail: string | null;
  actionType: string | null;
  actionDueAt: string | null;
  recruitingRole: string | null;
  recruitingFirstName: string | null;
  recruitingLastName: string | null;
  recruitingPhone: string | null;
  recruitingEmail: string | null;
  recruitingZip: string | null;
  recruitingCityState: string | null;
  recruitingLinkedin: string | null;
  recruitingResumeFilename: string | null;
  recruitingMessage: string | null;
  force?: boolean;
  // Test-data hygiene only (docs/engineering/TEST_DATA_HYGIENE.md) — never
  // set by automatic processing.
  testMarker?: string | null;
}

export async function processWebsiteIntakeSubmission(
  input: ProcessWebsiteIntakeInput
): Promise<{ record?: IntakeProcessingRecord; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("process_website_intake_submission", {
    p_submission_id: input.submissionId,
    p_classification: input.classification,
    p_confidence_score: input.confidenceScore,
    p_confidence_band: input.confidenceBand,
    p_reason_codes: input.reasonCodes,
    p_normalized_envelope: input.normalizedEnvelope,
    p_existing_relationship_id: input.existingRelationshipId,
    p_relationship_type: input.relationshipType,
    p_display_name: input.displayName,
    p_resident_id: input.residentId,
    p_prospective_client_first_name: input.prospectiveClientFirstName,
    p_prospective_client_last_name: input.prospectiveClientLastName,
    p_prospective_client_preferred_name: input.prospectiveClientPreferredName,
    p_prospective_client_phone: input.prospectiveClientPhone,
    p_prospective_client_email: input.prospectiveClientEmail,
    p_primary_contact_name: input.primaryContactName,
    p_primary_contact_relationship: input.primaryContactRelationship,
    p_primary_contact_phone: input.primaryContactPhone,
    p_primary_contact_email: input.primaryContactEmail,
    p_primary_contact_is_prospective_client: input.primaryContactIsProspectiveClient,
    p_organization_name: input.organizationName,
    p_owner_label: input.ownerLabel,
    p_priority: input.priority,
    p_source_label: input.sourceLabel,
    p_service_address_line_1: input.serviceAddressLine1,
    p_service_address_line_2: input.serviceAddressLine2,
    p_service_city: input.serviceCity,
    p_service_state: input.serviceState,
    p_service_postal_code: input.servicePostalCode,
    p_service_residence_type: input.serviceResidenceType,
    p_service_summary: input.serviceSummary,
    p_intake_context_note: input.intakeContextNote,
    p_action_title: input.actionTitle,
    p_action_detail: input.actionDetail,
    p_action_type: input.actionType,
    p_action_due_at: input.actionDueAt,
    p_recruiting_role: input.recruitingRole,
    p_recruiting_first_name: input.recruitingFirstName,
    p_recruiting_last_name: input.recruitingLastName,
    p_recruiting_phone: input.recruitingPhone,
    p_recruiting_email: input.recruitingEmail,
    p_recruiting_zip: input.recruitingZip,
    p_recruiting_city_state: input.recruitingCityState,
    p_recruiting_linkedin: input.recruitingLinkedin,
    p_recruiting_resume_filename: input.recruitingResumeFilename,
    p_recruiting_message: input.recruitingMessage,
    p_force: input.force ?? false,
    p_test_marker: input.testMarker ?? null,
  });

  if (error) {
    console.error("[intakeEngine:processWebsiteIntakeSubmission:error]", {
      submissionId: input.submissionId,
      message: error.message,
      code: error.code,
    });
    return { error: error.message };
  }

  return { record: data as IntakeProcessingRecord };
}

export async function recordIntakeProcessingFailure(
  submissionId: string,
  intakeType: string,
  errorMessage: string
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("record_intake_processing_failure", {
    p_submission_id: submissionId,
    p_intake_type: intakeType,
    p_error: errorMessage,
  });
  if (error) {
    console.error("[intakeEngine:recordIntakeProcessingFailure:error]", { submissionId, message: error.message });
  }
}
