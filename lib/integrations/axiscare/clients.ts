import "server-only";
import { axisCareGet } from "./client.ts";
import type { AxisCareClientsResponse } from "./types.ts";

// Path confirmed by the AxisCare OpenAPI specification: /api/clients.
const CLIENTS_PATH = "/api/clients";

// Smallest supported page (limit=1) to inspect response structure only —
// not a full import of the client roster, and does not depend on knowing
// an existing client ID.
//
// Deliberately does NOT send `requestedSensitiveFields`. The token has
// Clients Read Sensitive scope, but this discovery spike has no need for
// SSNs, driver-license data, or other sensitive attributes — the field
// simply never appears in this request.
export async function getClientSample() {
  return axisCareGet<AxisCareClientsResponse>(CLIENTS_PATH, { limit: "1" });
}
