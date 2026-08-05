import "server-only";
import { axisCareGet } from "./client.ts";
import type { AxisCareOrganizationsResponse } from "./types.ts";

// Path confirmed by AxisCare's public OpenAPI specification: /api/organizations.
const ORGANIZATIONS_PATH = "/api/organizations";

// Per the spec's worked example, "Organizations" here are external
// referral/partner organizations (e.g. hospitals) tracked in AxisCare —
// not Serve's own multi-site/agency configuration. Confirm this reading
// against a live sample before building anything on top of it.
//
// limit=1: smallest supported page, per the spec's documented
// 1-500 range (default 100).
export async function getOrganizationSample() {
  return axisCareGet<AxisCareOrganizationsResponse>(ORGANIZATIONS_PATH, {
    limit: "1",
  });
}
