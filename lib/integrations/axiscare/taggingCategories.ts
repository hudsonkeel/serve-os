import "server-only";
import { axisCareGet } from "./client.ts";
import type { AxisCareTaggingCategoriesResponse } from "./types.ts";

// Path confirmed by AxisCare's public OpenAPI specification:
// /api/taggingCategories (camelCase in the URL itself — not a hyphenated
// path like most other endpoints).
const TAGGING_CATEGORIES_PATH = "/api/taggingCategories";

// No query parameters and no pagination field in the spec — this returns
// the agency's full tagging-category list (attachable to Notes/Tasks) in
// one response.
export async function getTaggingCategorySample() {
  return axisCareGet<AxisCareTaggingCategoriesResponse>(
    TAGGING_CATEGORIES_PATH
  );
}
