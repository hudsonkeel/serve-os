import "server-only";
import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import type { BackgroundEligibilityClassificationId } from "./types.ts";
import { isBackgroundEligibilityClassificationId } from "./types.ts";

// Parses docs/governance/workforce/background-eligibility/classification-rules.yml
// at runtime — the deterministic evaluation sequence from 05-review-workflow.md
// §3, read directly rather than reimplemented from a paraphrase of it.

export interface EvaluationMatchStep {
  readonly step: number;
  readonly action: "match";
  readonly againstCategoryClassification: BackgroundEligibilityClassificationId;
  readonly onMatch: {
    readonly result: BackgroundEligibilityClassificationId;
    readonly terminal: boolean;
    readonly reviewProcedure: string | null;
  };
}

export interface EvaluationFallbackStep {
  readonly step: number;
  readonly action: "fallback";
  readonly onNoMatch: true;
  readonly result: BackgroundEligibilityClassificationId;
  readonly terminal: boolean;
  readonly reviewProcedure: string | null;
}

export interface EvaluationNormalizeStep {
  readonly step: number;
  readonly action: "normalize_findings";
}

export type EvaluationStep = EvaluationNormalizeStep | EvaluationMatchStep | EvaluationFallbackStep;

export interface ClassificationRules {
  readonly version: string;
  readonly status: string;
  readonly evaluationOrder: readonly EvaluationStep[];
  readonly fallbackClassification: BackgroundEligibilityClassificationId;
}

const DEFAULT_RULES_PATH = path.join(
  process.cwd(),
  "docs/governance/workforce/background-eligibility/classification-rules.yml",
);

let cached: ClassificationRules | null = null;

export function loadClassificationRules(filePath: string = DEFAULT_RULES_PATH): ClassificationRules {
  if (cached && filePath === DEFAULT_RULES_PATH) return cached;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `[classificationRules] Could not read the governance classification rules at "${filePath}". ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(raw);
  } catch (err) {
    throw new Error(
      `[classificationRules] "${filePath}" is not valid YAML. Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const rules = validateShape(parsed, filePath);
  if (filePath === DEFAULT_RULES_PATH) cached = rules;
  return rules;
}

function validateShape(value: unknown, filePath: string): ClassificationRules {
  if (!value || typeof value !== "object") {
    throw new Error(`[classificationRules] "${filePath}" did not parse to an object.`);
  }
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.version !== "string" ||
    typeof obj.status !== "string" ||
    !Array.isArray(obj.evaluation_order) ||
    typeof obj.fallback_classification !== "string" ||
    !isBackgroundEligibilityClassificationId(obj.fallback_classification)
  ) {
    throw new Error(
      `[classificationRules] "${filePath}" is missing required top-level fields ` +
        `(version/status/evaluation_order/fallback_classification).`,
    );
  }

  const evaluationOrder = obj.evaluation_order.map((raw, index) => validateStep(raw, filePath, index));
  if (!evaluationOrder.some((step) => step.action === "fallback")) {
    throw new Error(
      `[classificationRules] "${filePath}" evaluation_order has no fallback step — every evaluation ` +
        `must terminate in one per 01-background-eligibility-ontology.md §3.3 (collectively exhaustive).`,
    );
  }

  return {
    version: obj.version,
    status: obj.status,
    evaluationOrder,
    fallbackClassification: obj.fallback_classification,
  };
}

function validateStep(value: unknown, filePath: string, index: number): EvaluationStep {
  if (!value || typeof value !== "object") {
    throw new Error(`[classificationRules] "${filePath}" evaluation_order[${index}] is not an object.`);
  }
  const obj = value as Record<string, unknown>;
  const step = obj.step;
  if (typeof step !== "number") {
    throw new Error(`[classificationRules] "${filePath}" evaluation_order[${index}] is missing a numeric "step".`);
  }

  if (obj.action === "normalize_findings") {
    return { step, action: "normalize_findings" };
  }

  if (obj.action === "match") {
    const against = obj.against_category_classification;
    const onMatch = obj.on_match as Record<string, unknown> | undefined;
    if (
      typeof against !== "string" ||
      !isBackgroundEligibilityClassificationId(against) ||
      !onMatch ||
      typeof onMatch.result !== "string" ||
      !isBackgroundEligibilityClassificationId(onMatch.result) ||
      typeof onMatch.terminal !== "boolean"
    ) {
      throw new Error(
        `[classificationRules] "${filePath}" evaluation_order[${index}] (step=${step}) is a malformed "match" step.`,
      );
    }
    return {
      step,
      action: "match",
      againstCategoryClassification: against,
      onMatch: {
        result: onMatch.result,
        terminal: onMatch.terminal,
        reviewProcedure: typeof onMatch.review_procedure === "string" ? onMatch.review_procedure : null,
      },
    };
  }

  if (obj.action === "fallback") {
    if (obj.on_no_match !== true || typeof obj.result !== "string" || !isBackgroundEligibilityClassificationId(obj.result)) {
      throw new Error(
        `[classificationRules] "${filePath}" evaluation_order[${index}] (step=${step}) is a malformed "fallback" step.`,
      );
    }
    return {
      step,
      action: "fallback",
      onNoMatch: true,
      result: obj.result,
      terminal: obj.terminal === true,
      reviewProcedure: typeof obj.review_procedure === "string" ? obj.review_procedure : null,
    };
  }

  throw new Error(
    `[classificationRules] "${filePath}" evaluation_order[${index}] (step=${step}) has an unrecognized action "${String(obj.action)}".`,
  );
}
