import "server-only";
import { axisCareGet } from "./client.ts";
import type { AxisCareExpiringTokensResponse } from "./types.ts";

// Path confirmed by AxisCare's public OpenAPI specification:
// /api/tokens/expiring. Requires an API token with "Expiring Tokens" read
// permission — a distinct scope from the four credential/data scopes this
// integration already uses; a 403 here means that scope specifically is
// missing, not that the token overall is invalid.
const EXPIRING_TOKENS_PATH = "/api/tokens/expiring";

// Returns active API tokens (by name, never by value) expiring within the
// next 30 days, per the spec. This is the correct, vendor-confirmed way to
// answer "when does our AxisCare token expire" — never a hand-maintained
// env var. See docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md for how
// this feeds integration-health reporting.
export async function getExpiringTokensSample() {
  return axisCareGet<AxisCareExpiringTokensResponse>(EXPIRING_TOKENS_PATH, {
    limit: "5",
  });
}
