import "server-only";
import { axisCareGet } from "./client.ts";
import type { AxisCareCaregiversResponse } from "./types.ts";

// Path confirmed by the AxisCare OpenAPI specification: /api/caregivers.
const CAREGIVERS_PATH = "/api/caregivers";

// Smallest supported page (limit=1) to inspect response structure only —
// not a full import of the caregiver roster, and does not depend on
// knowing an existing caregiver ID.
//
// Deliberately does NOT send `requestedSensitiveFields`. The token has
// Caregivers Read Sensitive scope, but this discovery spike has no need
// for SSNs, driver-license data, or other sensitive attributes — the
// field simply never appears in this request.
export async function getCaregiverSample() {
  return axisCareGet<AxisCareCaregiversResponse>(CAREGIVERS_PATH, {
    limit: "1",
  });
}
