import type { Locator, Page } from "playwright";
import type { RawObservation } from "../../../collectors/types.ts";
import { extractField, type FieldSelectorConfig } from "./extraction.ts";

// Level A extractor — see docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md
// Phase 2. Deliberately generic: this file contains NO Apploi-specific
// selector guesses. `fields` is supplied by the caller, populated for real
// only once scripts/collectors/apploiDomReconnaissance.ts has produced
// verified selector strategies for the actual candidate row markup.
export const ROW_SCAN_EXTRACTOR_VERSION = "apploi.rowScan@1";

export async function rowScan(
  scope: Page | Locator,
  fields: readonly FieldSelectorConfig[],
  observedAt: string = new Date().toISOString()
): Promise<RawObservation[]> {
  const results: RawObservation[] = [];
  for (const field of fields) {
    results.push(await extractField(scope, field, ROW_SCAN_EXTRACTOR_VERSION, observedAt));
  }
  return results;
}
