// Script-compatible data layer for Watermere roster reconciliation —
// relative imports with explicit .ts extensions (matches lib/data/
// relationships.ts's convention), so scripts/importWatermereRoster.ts can
// import it directly without the Next.js "@/" alias.
import { createServerClient } from "../supabase/server.ts";
import type { LiveResident, PersonOutcome } from "../residents/roster/types.ts";

export async function loadLiveWatermereResidents(communityCode: string): Promise<LiveResident[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, middle_name, preferred_name, display_name, full_name, unit_number, building, community_code, is_active")
    .eq("community_code", communityCode)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load live residents: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    preferredName: r.preferred_name as string | null,
    displayName: r.display_name as string | null,
    fullName: r.full_name as string | null,
    unitNumber: r.unit_number as string | null,
    building: r.building as string | null,
    communityCode: r.community_code as string | null,
    isActive: r.is_active as boolean,
  }));
}

export interface CreateImportRunInput {
  communityCode: string;
  sourceFilename: string;
  sourceHash: string;
  sourceEffectiveDate: string | null;
  importedBy: string;
  mode: "dry_run" | "apply";
}

export async function createImportRun(input: CreateImportRunInput): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("roster_import_runs")
    .insert({
      community_code: input.communityCode,
      source_filename: input.sourceFilename,
      source_hash: input.sourceHash,
      source_effective_date: input.sourceEffectiveDate,
      imported_by: input.importedBy,
      mode: input.mode,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[residentRoster:createImportRun:error]", { message: error.message, code: error.code });
    return { error: "Could not create the import run record." };
  }
  return { id: data.id as string };
}

export interface UpdateImportRunCountsInput {
  runId: string;
  totalSourceRows: number;
  matchedCount: number;
  apartmentChangeCount: number;
  newResidentCount: number;
  ambiguousCount: number;
  duplicateSourceCount: number;
  absentExistingCount: number;
  noOpCount: number;
  appliedAt: string | null;
}

export async function updateImportRunCounts(input: UpdateImportRunCountsInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("roster_import_runs")
    .update({
      total_source_rows: input.totalSourceRows,
      matched_count: input.matchedCount,
      apartment_change_count: input.apartmentChangeCount,
      new_resident_count: input.newResidentCount,
      ambiguous_count: input.ambiguousCount,
      duplicate_source_count: input.duplicateSourceCount,
      absent_existing_count: input.absentExistingCount,
      no_op_count: input.noOpCount,
      applied_at: input.appliedAt,
    })
    .eq("id", input.runId);

  if (error) {
    console.error("[residentRoster:updateImportRunCounts:error]", { message: error.message, code: error.code });
    return { error: "Could not update the import run record." };
  }
  return {};
}

export async function insertSourceRows(
  runId: string,
  outcomes: readonly PersonOutcome[],
): Promise<{ error?: string }> {
  if (outcomes.length === 0) return {};
  const supabase = createServerClient();
  const { error } = await supabase.from("roster_source_rows").insert(
    outcomes.map((o) => ({
      import_run_id: runId,
      source_sheet: o.person.sourceSheet,
      source_row_number: o.person.sourceRowNumber,
      raw_payload: { displayLabel: o.person.displayLabel, apartment: o.person.apartment },
      normalized_payload: { lastName: o.person.lastName, firstName: o.person.firstName, apartment: o.person.apartment },
      resolution_status: o.classification,
      matched_resident_id: o.residentId,
      match_method: o.matchMethod,
      match_confidence: o.matchConfidence,
      review_notes: [o.reason, o.directoryDiscrepancy].filter(Boolean).join(" "),
    })),
  );

  if (error) {
    console.error("[residentRoster:insertSourceRows:error]", { message: error.message, code: error.code });
    return { error: "Could not record source rows for this import run." };
  }
  return {};
}

export interface ApplyApartmentChangeInput {
  residentId: string;
  newUnitNumber: string;
  newBuilding: string | null;
  communityCode: string;
  importRunId: string;
  actor: string;
}

export async function applyRosterApartmentChange(input: ApplyApartmentChangeInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("apply_roster_apartment_change", {
    p_resident_id: input.residentId,
    p_new_unit_number: input.newUnitNumber,
    p_new_building: input.newBuilding,
    p_community_code: input.communityCode,
    p_import_run_id: input.importRunId,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentRoster:applyRosterApartmentChange:error]", { residentId: input.residentId, message: error.message, code: error.code });
    return { error: "Could not apply this apartment change." };
  }
  return {};
}

export interface ApplyNewResidentInput {
  firstName: string;
  lastName: string;
  displayName: string;
  fullName: string;
  communityName: string;
  communityCode: string;
  unitNumber: string;
  building: string | null;
  phone: string | null;
  // The true, unmodified source value — distinct from `phone` (validated/
  // normalized for storage, null when invalid). Previously both columns
  // were written from the same normalized value, so `phone_raw` never
  // actually held the raw source string; see
  // supabase/migrations/20260807000000_create_resident_data_integrity.sql.
  phoneRaw: string | null;
  sourceSystem: string;
  sourceFile: string;
  importBatch: string;
  importRunId: string;
  actor: string;
}

export async function applyRosterNewResident(input: ApplyNewResidentInput): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("apply_roster_new_resident", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_display_name: input.displayName,
    p_full_name: input.fullName,
    p_community_name: input.communityName,
    p_community_code: input.communityCode,
    p_unit_number: input.unitNumber,
    p_building: input.building,
    p_phone: input.phone,
    p_phone_raw: input.phoneRaw,
    p_source_system: input.sourceSystem,
    p_source_file: input.sourceFile,
    p_import_batch: input.importBatch,
    p_import_run_id: input.importRunId,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentRoster:applyRosterNewResident:error]", { message: error.message, code: error.code });
    return { error: "Could not create this resident." };
  }
  return { id: data as string };
}

export interface RecordAbsenceInput {
  residentId: string;
  importRunId: string;
  communityCode: string;
  lastKnownUnitNumber: string | null;
  actor: string;
}

export async function recordRosterAbsence(input: RecordAbsenceInput): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("record_roster_absence", {
    p_resident_id: input.residentId,
    p_import_run_id: input.importRunId,
    p_community_code: input.communityCode,
    p_last_known_unit_number: input.lastKnownUnitNumber,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentRoster:recordRosterAbsence:error]", { residentId: input.residentId, message: error.message, code: error.code });
    return { error: "Could not record this roster absence." };
  }
  return { id: data as string };
}

export async function getOpenAbsenceReviewByResident(residentId: string): Promise<{ id: string } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("roster_absence_reviews")
    .select("id")
    .eq("resident_id", residentId)
    .eq("status", "requires_review")
    .maybeSingle();

  if (error) {
    console.error("[residentRoster:getOpenAbsenceReviewByResident:error]", { residentId, message: error.message, code: error.code });
    return null;
  }
  return data ? { id: data.id as string } : null;
}

export interface ResolveAbsenceInput {
  reviewId: string;
  disposition: "moved_out" | "deceased" | "transferred" | "still_active" | "unknown";
  disposition_reason: string | null;
  disposition_effective_date: string | null;
  decidedBy: string;
}

export async function resolveRosterAbsence(input: ResolveAbsenceInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_roster_absence", {
    p_review_id: input.reviewId,
    p_disposition: input.disposition,
    p_disposition_reason: input.disposition_reason,
    p_disposition_effective_date: input.disposition_effective_date,
    p_decided_by: input.decidedBy,
  });

  if (error) {
    console.error("[residentRoster:resolveRosterAbsence:error]", { reviewId: input.reviewId, message: error.message, code: error.code });
    return { error: "Could not resolve this roster absence review." };
  }
  return {};
}
