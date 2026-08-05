// Pure observation-write planning for state observations — see the
// approved plan's "OBSERVATION IDEMPOTENCY" decision. A state observation
// (a current-value fact like position, resume availability, or Viventium
// integration status — as opposed to a discrete event) is deduplicated on
// (source_system, source_record_id, observation_key), never on
// normalized_value alone across the whole lead, so two different fields
// never collide.
//
// No I/O here — the caller fetches existing observations once and this
// function only decides what to insert, so it's fully testable without a
// database.
import type { ObservationInput } from "../data/recruitingLeadCollector.ts";
import type { RecruitingLeadObservation } from "../supabase/types.ts";

export interface ObservationWritePlan {
  readonly toInsert: readonly ObservationInput[];
  readonly skippedUnchanged: readonly string[]; // observationKeys skipped because unchanged
}

export function planStateObservationWrites(
  existing: readonly RecruitingLeadObservation[],
  candidates: readonly ObservationInput[]
): ObservationWritePlan {
  const toInsert: ObservationInput[] = [];
  const skippedUnchanged: string[] = [];

  for (const candidate of candidates) {
    // Only a real, confirmed value can ever be "unchanged" — a failed
    // extraction (not_visible/unknown/ambiguous) is its own event and is
    // always recorded, never deduplicated against a prior directly
    // observed fact.
    if (candidate.visibility !== "directly_observed") {
      toInsert.push(candidate);
      continue;
    }

    const matchingForIdentity = existing.filter(
      (o) =>
        o.source_system === (candidate.sourceSystem ?? null) &&
        o.source_record_id === (candidate.sourceRecordId ?? null) &&
        o.observation_key === candidate.observationKey &&
        o.visibility === "directly_observed"
    );

    const latest = matchingForIdentity.sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1))[0];

    if (latest && latest.normalized_value === candidate.normalizedValue) {
      skippedUnchanged.push(candidate.observationKey);
      continue;
    }

    toInsert.push(candidate);
  }

  return { toInsert, skippedUnchanged };
}
