// Data layer for the Recruiting Lead Flight — see
// docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md. Relative imports with
// explicit .ts extensions so this is callable from the plain-node collector
// script as well as the Next.js app, matching lib/data/recruitingLeads.ts.
//
// Nothing in this file ever writes to recruiting_leads.status — there is no
// function here capable of it. Vendor observations and the lead's own
// recruiting status remain entirely separate write paths, by construction.
import { createServerClient } from "../supabase/server.ts";
import type {
  CollectorMatchStatus,
  CollectorRunStatus,
  CollectorSourceSystem,
  ObservationCollectionMethod,
  ObservationExtractionConfidence,
  ObservationMatchMethod,
  ObservationSensitivity,
  ObservationVisibility,
  RecruitingLeadCollectorRun,
  RecruitingLeadObservation,
} from "../supabase/types.ts";

export async function createCollectorRun(input: {
  recruitingLeadId: string;
  sourceSystem: CollectorSourceSystem;
  initiatedBy: string;
  flightMarker: string;
}): Promise<{ run?: RecruitingLeadCollectorRun; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_lead_collector_runs")
    .insert({
      recruiting_lead_id: input.recruitingLeadId,
      source_system: input.sourceSystem,
      initiated_by: input.initiatedBy,
      status: "in_progress",
      flight_marker: input.flightMarker,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createCollectorRun]", { message: error.message });
    return { error: "Could not create collector run." };
  }

  return { run: data as RecruitingLeadCollectorRun };
}

export async function completeCollectorRun(input: {
  collectorRunId: string;
  status: CollectorRunStatus;
  matchStatus: CollectorMatchStatus | null;
  errorCategory?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("recruiting_lead_collector_runs")
    .update({
      status: input.status,
      match_status: input.matchStatus,
      error_category: input.errorCategory ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.collectorRunId);

  if (error) {
    console.error("[completeCollectorRun]", { message: error.message });
    return { error: "Could not complete collector run." };
  }

  return {};
}

export interface ObservationInput {
  observationKey: string;
  rawLabel: string | null;
  normalizedValue: string | null;
  visibility: ObservationVisibility;
  observedAt: string;
  // All optional, defaulted at the DB layer for guided-manual callers that
  // predate the extended contract (docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md
  // Phase 3) — an automatic_dom extractor populates every one of these.
  sourceSystem?: CollectorSourceSystem | null;
  sourceRecordId?: string | null;
  collectedAt?: string;
  sourceLocation?: string | null;
  extractorVersion?: string | null;
  extractionConfidence?: ObservationExtractionConfidence | null;
  matchMethod?: ObservationMatchMethod | null;
  failureReason?: string | null;
  sensitivity?: ObservationSensitivity;
  collectionMethod?: ObservationCollectionMethod;
}

export async function insertObservations(input: {
  collectorRunId: string;
  recruitingLeadId: string;
  observations: readonly ObservationInput[];
}): Promise<{ error?: string }> {
  if (input.observations.length === 0) return {};

  const supabase = createServerClient();

  const { error } = await supabase.from("recruiting_lead_observations").insert(
    input.observations.map((o) => ({
      collector_run_id: input.collectorRunId,
      recruiting_lead_id: input.recruitingLeadId,
      observation_key: o.observationKey,
      raw_label: o.rawLabel,
      normalized_value: o.normalizedValue,
      visibility: o.visibility,
      observed_at: o.observedAt,
      source_system: o.sourceSystem ?? null,
      source_record_id: o.sourceRecordId ?? null,
      collected_at: o.collectedAt ?? new Date().toISOString(),
      source_location: o.sourceLocation ?? null,
      extractor_version: o.extractorVersion ?? null,
      extraction_confidence: o.extractionConfidence ?? null,
      match_method: o.matchMethod ?? (o.collectionMethod === "automatic_dom" ? null : "manual"),
      failure_reason: o.failureReason ?? null,
      sensitivity: o.sensitivity ?? "standard",
      collection_method: o.collectionMethod ?? "guided_manual",
    }))
  );

  if (error) {
    console.error("[insertObservations]", { message: error.message });
    return { error: "Could not persist observations." };
  }

  return {};
}

export async function getCollectorRunsForLead(
  recruitingLeadId: string
): Promise<RecruitingLeadCollectorRun[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_lead_collector_runs")
    .select("*")
    .eq("recruiting_lead_id", recruitingLeadId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getCollectorRunsForLead]", { recruitingLeadId, message: error.message });
    return [];
  }

  return (data as RecruitingLeadCollectorRun[] | null) ?? [];
}

export async function getObservationsForLead(
  recruitingLeadId: string
): Promise<RecruitingLeadObservation[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_lead_observations")
    .select("*")
    .eq("recruiting_lead_id", recruitingLeadId)
    .order("observed_at", { ascending: false });

  if (error) {
    console.error("[getObservationsForLead]", { recruitingLeadId, message: error.message });
    return [];
  }

  return (data as RecruitingLeadObservation[] | null) ?? [];
}

// Builds the exact input shape lib/recruiting/deriveHiringSynthesis.ts
// expects, from the most recent collector run per vendor and its
// observations — the one place "most recent run per source system" is
// computed, so the UI and any future caller never re-derive it differently.
export function buildVendorEvidenceInputs(
  runs: readonly RecruitingLeadCollectorRun[],
  observations: readonly RecruitingLeadObservation[]
): {
  apploi: import("../recruiting/deriveHiringSynthesis.ts").VendorEvidenceInput | null;
  viventium: import("../recruiting/deriveHiringSynthesis.ts").VendorEvidenceInput | null;
} {
  function mostRecentRun(source: CollectorSourceSystem): RecruitingLeadCollectorRun | null {
    const forSource = runs.filter((r) => r.source_system === source);
    if (forSource.length === 0) return null;
    return forSource.reduce((latest, r) => (r.created_at > latest.created_at ? r : latest));
  }

  function evidenceFor(source: CollectorSourceSystem) {
    const run = mostRecentRun(source);
    if (!run) return null;
    return {
      runStatus: run.status,
      matchStatus: run.match_status,
      observations: observations.filter((o) => o.collector_run_id === run.id),
      observedAt: run.completed_at ?? run.started_at,
    };
  }

  return { apploi: evidenceFor("apploi"), viventium: evidenceFor("viventium") };
}
