import "server-only";
import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import type { BackgroundEligibilityClassificationId } from "./types.ts";
import { isBackgroundEligibilityClassificationId } from "./types.ts";

// Parses docs/governance/workforce/background-eligibility/offense-taxonomy.yml
// at runtime — deliberately not hand-transcribed into TypeScript constants.
// 06-offense-taxonomy.md §1: "the YAML is the intended source of truth for
// any future software implementation." See
// docs/architecture/decisions/0002-governance-decision-vertical-slice.md
// for why this file reads the real YAML instead of a copy of it, and how
// that stays deployment-safe (next.config.ts's outputFileTracingIncludes).

export interface OffenseCategory {
  readonly id: string;
  readonly label: string;
  readonly classification: BackgroundEligibilityClassificationId;
  readonly riskDomains: readonly string[];
  readonly offenses: readonly string[];
}

export interface OffenseTaxonomy {
  readonly version: string;
  readonly status: string;
  readonly categories: readonly OffenseCategory[];
}

const DEFAULT_TAXONOMY_PATH = path.join(
  process.cwd(),
  "docs/governance/workforce/background-eligibility/offense-taxonomy.yml",
);

let cached: OffenseTaxonomy | null = null;

// filePath is injectable so tests can point this at a deliberately malformed
// or missing fixture without touching the real governance document. Only
// the default path's result is memoized.
export function loadOffenseTaxonomy(filePath: string = DEFAULT_TAXONOMY_PATH): OffenseTaxonomy {
  if (cached && filePath === DEFAULT_TAXONOMY_PATH) return cached;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `[offenseTaxonomy] Could not read the governance offense taxonomy at "${filePath}". ` +
        `The classifier refuses to fall back to a hand-transcribed copy. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(raw);
  } catch (err) {
    throw new Error(
      `[offenseTaxonomy] "${filePath}" is not valid YAML — the classifier cannot proceed ` +
        `without its authoritative taxonomy. Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const taxonomy = validateShape(parsed, filePath);
  if (filePath === DEFAULT_TAXONOMY_PATH) cached = taxonomy;
  return taxonomy;
}

function validateShape(value: unknown, filePath: string): OffenseTaxonomy {
  if (!value || typeof value !== "object") {
    throw new Error(`[offenseTaxonomy] "${filePath}" did not parse to an object.`);
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== "string" || typeof obj.status !== "string" || !Array.isArray(obj.categories)) {
    throw new Error(
      `[offenseTaxonomy] "${filePath}" is missing required top-level fields (version/status/categories).`,
    );
  }
  const categories = obj.categories.map((raw, index) => validateCategory(raw, filePath, index));
  return { version: obj.version, status: obj.status, categories };
}

function validateCategory(value: unknown, filePath: string, index: number): OffenseCategory {
  if (!value || typeof value !== "object") {
    throw new Error(`[offenseTaxonomy] "${filePath}" categories[${index}] is not an object.`);
  }
  const obj = value as Record<string, unknown>;
  const { id, label, classification, offenses } = obj;
  if (
    typeof id !== "string" ||
    typeof label !== "string" ||
    typeof classification !== "string" ||
    !isBackgroundEligibilityClassificationId(classification) ||
    !Array.isArray(offenses)
  ) {
    throw new Error(
      `[offenseTaxonomy] "${filePath}" categories[${index}] (id=${String(id)}) is missing required ` +
        `fields or has an unrecognized classification.`,
    );
  }
  const riskDomains = Array.isArray(obj.risk_domains)
    ? obj.risk_domains.filter((d): d is string => typeof d === "string")
    : [];
  return {
    id,
    label,
    classification,
    riskDomains,
    offenses: offenses.filter((o): o is string => typeof o === "string"),
  };
}
