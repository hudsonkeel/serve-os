// Shared constants for the Client Readiness domain module — see
// "Client Readiness — Phase A.2 Architecture Lock" for the source of every
// requirement code below.

export const CLIENT_RECORD_READINESS_SET_CODE = "CLIENT_RECORD_READINESS";

export const CR_CLIENT_PROFILE_ON_FILE = "CR_CLIENT_PROFILE_ON_FILE";
export const CR_ASSESSMENT_CURRENT = "CR_ASSESSMENT_CURRENT";
export const CR_ISP_ON_FILE_AND_CURRENT = "CR_ISP_ON_FILE_AND_CURRENT";
export const CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED = "CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED";
export const CR_BILLING_AGREEMENT_ON_FILE = "CR_BILLING_AGREEMENT_ON_FILE";
export const CR_MEDICATION_LIST_ON_FILE = "CR_MEDICATION_LIST_ON_FILE";
export const CR_CARE_DOCUMENTATION_CURRENT = "CR_CARE_DOCUMENTATION_CURRENT";
export const CR_SUPERVISORY_VISIT_RECORDED = "CR_SUPERVISORY_VISIT_RECORDED";
export const CR_SIGNIFICANT_EVENTS_DOCUMENTED = "CR_SIGNIFICANT_EVENTS_DOCUMENTED";
export const CR_DISCHARGE_SUMMARY_ON_FILE = "CR_DISCHARGE_SUMMARY_ON_FILE";

// Reused, not duplicated — seeded by Emergency Preparedness
// (20260902080000_seed_emergency_preparedness_requirements.sql), resident-
// scoped, deliberately left unlinked from any requirement set until Client
// Readiness claimed it here.
export const EP_CLIENT_TRIAGE_CLASSIFIED = "EP_CLIENT_TRIAGE_CLASSIFIED";

// Requirements evaluated via bespoke composition (canonical resident facts
// and/or applicability logic the shared evidence-currency engine can't
// express on its own) rather than the standard evaluator alone.
export const BESPOKE_COMPOSITION_CODES: ReadonlySet<string> = new Set([
  CR_CLIENT_PROFILE_ON_FILE,
  CR_SIGNIFICANT_EVENTS_DOCUMENTED,
  CR_DISCHARGE_SUMMARY_ON_FILE,
]);

// Cadence-gated requirements (expiration_date set at write time) — every
// other requirement in the set is event-triggered/non-expiring, satisfied
// by continued existence until a real replacement/attestation event, same
// discipline already proven by Emergency Preparedness's
// NON_EXPIRING_REQUIREMENT_CODES.
export const ASSESSMENT_VALIDITY_DAYS = 365;
export const ISP_VALIDITY_DAYS = 365;
export const SUPERVISORY_VISIT_VALIDITY_DAYS = 365;
