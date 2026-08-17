// Shared constants for the Emergency Preparedness domain module — see
// docs/architecture/AUDIT_READINESS_EMERGENCY_PREPAREDNESS_REQUIREMENT_DRAFT.md
// (Phase A, approved) for the source of every requirement code below.

// The stable agencies.slug this domain module resolves against — never a
// bare "first row" lookup. See lib/data/agencies.ts.
export const SERVE_CAREGIVING_AGENCY_SLUG = "serve-caregiving";

export const EMERGENCY_PREPAREDNESS_READINESS_SET_CODE = "EMERGENCY_PREPAREDNESS_READINESS";

// The 6 agency-level requirements this domain module actually evaluates —
// see supabase/migrations/20260902080000_seed_emergency_preparedness_requirements.sql
// for why EP_STAFF_TRAINED (workforce_member) and EP_CLIENT_TRIAGE_CLASSIFIED /
// EP_CLIENT_INFO_PROVIDED_AT_ADMISSION (resident) are seeded but deliberately
// not part of this set.
export const EP_PLAN_MAINTAINED = "EP_PLAN_MAINTAINED";
export const EP_DISASTER_COORDINATOR_DESIGNATED = "EP_DISASTER_COORDINATOR_DESIGNATED";
export const EP_RISK_ASSESSMENT_CURRENT = "EP_RISK_ASSESSMENT_CURRENT";
export const EP_ANNUAL_PLAN_REVIEW = "EP_ANNUAL_PLAN_REVIEW";
export const EP_ANNUAL_RESPONSE_DRILL = "EP_ANNUAL_RESPONSE_DRILL";
export const EP_HHS_NOTIFICATION = "EP_HHS_NOTIFICATION";

// Requirements satisfied by continued existence, not a calendar —
// expiration_date is null on their satisfying evidence, so a missed annual
// review can never cascade into a false failure here (Phase B decision #2,
// the annual review's "still accurate" confirmation for these is preserved
// entirely as its own review-item row, with no resulting evidence row at
// all). Every other requirement in the set IS genuinely cadence-gated.
export const NON_EXPIRING_REQUIREMENT_CODES: ReadonlySet<string> = new Set([
  EP_PLAN_MAINTAINED,
  EP_DISASTER_COORDINATOR_DESIGNATED,
]);

// A cadence-gated requirement's fresh evidence row is valid for one year —
// the same "no cron, just an expiration_date set at write time" mechanism
// every other domain's "annual" requirement already uses (see
// lib/compliance/requirementSetStatus.ts — it has no cadence concept of its
// own).
export const ANNUAL_EVIDENCE_VALIDITY_DAYS = 365;

export const AGENCY_TEMPORARY_RELOCATION_EVENT = "agency_temporary_relocation";
export const AGENCY_SERVICE_AREA_EXPANSION_EVENT = "agency_service_area_expansion";
