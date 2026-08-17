// Data layer for compliance_activity — the audit-readiness-domain timeline
// (resident/agency/community subjects). See
// supabase/migrations/20260902030000_create_audit_readiness_platform.sql.
// Platform infrastructure, available to any audit-native domain; Emergency
// Preparedness is its first real writer of a subject-recorded operational
// event (agency_temporary_relocation / agency_service_area_expansion — see
// supabase/migrations/20260902090000_create_emergency_preparedness_reviews.sql).
import { createServerClient } from "../supabase/server.ts";
import type { ComplianceActivity, ComplianceActivityEventType, ComplianceActivitySubjectType } from "../supabase/types.ts";

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
