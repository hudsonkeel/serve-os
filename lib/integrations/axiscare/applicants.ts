import "server-only";
import { axisCareGet } from "./client.ts";
import type { AxisCareApplicantsResponse } from "./types.ts";

// Path confirmed by AxisCare's public OpenAPI specification: /api/applicants.
const APPLICANTS_PATH = "/api/applicants";

// Per the spec, this endpoint has no `limit` parameter (unlike
// clients/caregivers) — only applicantIds/statuses/requestedSensitiveFields/
// startAfterId. A bare request returns AxisCare's own default page size, an
// acceptable discovery-phase cost since applicant rosters are expected to be
// small. Applicants are pre-hire candidates in AxisCare; distinct from
// Serve's own recruiting_leads and from AxisCare Caregivers (a caregiver
// only exists in AxisCare once hired).
//
// Deliberately does NOT send `requestedSensitiveFields` — the Applicant
// schema includes an SSN field even without it, so no sensitive-field
// request is ever needed for discovery.
export async function getApplicantSample() {
  return axisCareGet<AxisCareApplicantsResponse>(APPLICANTS_PATH);
}
