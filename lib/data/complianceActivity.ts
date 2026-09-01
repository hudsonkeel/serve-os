// Data layer for compliance_activity — the audit-readiness-domain timeline
// (resident/agency/community subjects). See
// supabase/migrations/20260902030000_create_audit_readiness_platform.sql.
// Platform infrastructure, available to any audit-native domain; Emergency
// Preparedness is its first real writer of a subject-recorded operational
// event (agency_temporary_relocation / agency_service_area_expansion — see
// supabase/migrations/20260902090000_create_emergency_preparedness_reviews.sql).
import { createServerClient } from "../supabase/server.ts";
import type {
  ComplianceActivity,
  ComplianceActivityEventType,
  ComplianceActivitySourceType,
  ComplianceActivitySubjectType,
} from "../supabase/types.ts";

// Postgres unique-violation error code — used below to tell "this exact
// lifecycle event was already recorded" apart from a real failure.
const UNIQUE_VIOLATION = "23505";

// Governance Connective Slice v0.1 — compliance_activity.subject_type is
// fixed to resident | agency | community (no workforce_member value, same
// deliberate exclusion compliance_corrective_actions makes — see that
// table's own migration header). A resident-linked source record always
// gets subject_type='resident'; one with no resident but a community
// context (e.g. a property/facility incident) falls back to 'community'.
// A record with neither (rare — no resident, no community context) has no
// valid subject today and is skipped, not forced into an incorrect
// subject — a documented v0.1 limitation, not a silent gap. This mirrors
// exactly the fallback order lib/actions/incidents.ts already uses to
// resolve community_id at creation time.
export function resolveGovernanceActivitySubject(
  residentId: string | null,
  communityId: string | null
): { subjectType: ComplianceActivitySubjectType; subjectId: string } | null {
  if (residentId) return { subjectType: "resident", subjectId: residentId };
  if (communityId) return { subjectType: "community", subjectId: communityId };
  return null;
}

export async function getComplianceActivityForSubject(
  subjectType: ComplianceActivitySubjectType,
  subjectId: string
): Promise<ComplianceActivity[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("compliance_activity")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getComplianceActivityForSubject]", { subjectType, subjectId, message: error.message });
    return [];
  }

  return (data as ComplianceActivity[] | null) ?? [];
}

// Same "no consequential event is ever silent" discipline as every other
// activity/timeline table in this schema (workforce_activity,
// resident_timeline, relationship_timeline).
export async function recordComplianceActivity(input: {
  subjectType: ComplianceActivitySubjectType;
  subjectId: string;
  eventType: ComplianceActivityEventType;
  eventTitle: string;
  eventDescription: string | null;
  source: string;
  sourceType?: ComplianceActivitySourceType;
  sourceRecordId?: string;
  createdBy: string;
}): Promise<{ event?: ComplianceActivity; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("compliance_activity")
    .insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      event_type: input.eventType,
      event_title: input.eventTitle,
      event_description: input.eventDescription,
      source: input.source,
      source_type: input.sourceType ?? null,
      source_record_id: input.sourceRecordId ?? null,
      system_generated: false,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not record activity: ${error?.message}` };
  }

  return { event: data as ComplianceActivity };
}

// Governance Connective Slice v0.1 — a source-record-scoped lifecycle
// event (e.g. "this incident was reviewed") is idempotent by construction:
// compliance_activity_source_record_idx makes a second insert for the same
// (source_type, source_record_id, event_type) a unique-constraint
// violation rather than a duplicate row. This function treats that
// violation as success — the event is already recorded, which is exactly
// what the caller wanted — rather than as an error, so callers never need
// their own "did I already emit this" check. Any other failure is
// swallowed and logged: compliance_activity is reconstructible derived
// history (see the migration's own header), never canonical truth, so a
// lost event here must not fail or roll back the canonical write it
// describes.
export async function recordComplianceActivityForSource(input: {
  subjectType: ComplianceActivitySubjectType;
  subjectId: string;
  eventType: ComplianceActivityEventType;
  eventTitle: string;
  eventDescription: string | null;
  source: string;
  sourceType: ComplianceActivitySourceType;
  sourceRecordId: string;
  createdBy: string;
}): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase.from("compliance_activity").insert({
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    event_type: input.eventType,
    event_title: input.eventTitle,
    event_description: input.eventDescription,
    source: input.source,
    source_type: input.sourceType,
    source_record_id: input.sourceRecordId,
    system_generated: false,
    created_by: input.createdBy,
  });

  if (!error) return;

  if (error.code === UNIQUE_VIOLATION) {
    // Already recorded — exactly the outcome this call wanted. Not an error.
    return;
  }

  console.error("[recordComplianceActivityForSource]", {
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    eventType: input.eventType,
    message: error.message,
  });
}
