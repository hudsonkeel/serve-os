import "server-only";
import { axisCareGet } from "./client.ts";
import type { AxisCareClientClass, AxisCareClientClassesResponse } from "./types.ts";

// Spec-confirmed (GET /api/classes/client, OpenAPI 2025-06-25): { code, label } pairs, both
// required. This is the sanctioned way to resolve a real configured class (e.g. "WAF Prospects")
// to its actual `code` before building a write candidate — never hardcode a guessed class code.
// Read-only, same as every other function in this integration.
const CLIENT_CLASSES_PATH = "/api/classes/client";

export async function getClientClasses(): Promise<AxisCareClientClass[]> {
  const result = await axisCareGet<AxisCareClientClassesResponse>(CLIENT_CLASSES_PATH);
  return result.body.results?.classes ?? [];
}

/** Case-insensitive label match — AxisCare's own label casing/spacing conventions aren't
 * guaranteed stable, and this is used to resolve human-meaningful names like "WAF Prospects"
 * or "CINCH" that appear in Serve's operating rules, not raw codes. Returns null (never a
 * guess) if no configured class matches. */
export function findClientClassByLabel(
  classes: AxisCareClientClass[],
  labelSubstring: string
): AxisCareClientClass | null {
  const needle = labelSubstring.trim().toLowerCase();
  return classes.find((c) => c.label.toLowerCase().includes(needle)) ?? null;
}
