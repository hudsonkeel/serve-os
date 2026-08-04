import "server-only";
import { axisCareGet } from "./client.ts";
import type {
  AxisCareAdlsResponse,
  AxisCareAdlCategoriesResponse,
} from "./types.ts";

// Both paths confirmed by AxisCare's public OpenAPI specification.
const ADLS_PATH = "/api/adls";
const ADL_CATEGORIES_PATH = "/api/adls/categories";

// Envelope is results.data (not results.adls) per the spec — deliberately
// different from every other list endpoint in this integration.
// limit=1: smallest supported page, per the spec's documented 1-500 range
// (default 100).
export async function getAdlSample() {
  return axisCareGet<AxisCareAdlsResponse>(ADLS_PATH, { limit: "1" });
}

// No limit/pagination parameters in the spec — this returns the agency's
// full ADL category list (a small, largely static reference set) in one
// response.
export async function getAdlCategorySample() {
  return axisCareGet<AxisCareAdlCategoriesResponse>(ADL_CATEGORIES_PATH);
}
