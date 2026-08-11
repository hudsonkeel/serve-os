// Deterministic pricing engine — field-based, not keyword-text matching (a real improvement
// over the old MVP's approach of flattening output into one string and regex-scanning it,
// which was fragile). Consumes only approved, confirmed_yes facts — never draft facts, never
// AI free text. If nothing maps safely to the published catalog, returns
// "pricing_review_required" rather than manufacturing a rate — see docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §5. This is a deliberate tightening versus the
// old MVP, which defaulted to "Essential Service" when nothing matched and invented a "custom
// scheduled visit" estimate for long durations — both of those are exactly the kind of
// manufactured rate this governance rule now forbids.

import { A_LA_CARTE, PACKAGES, PRICING_CATALOG_VERSION, type CatalogService } from "./pricingCatalog.ts";
import type { AssertionState } from "./factTypes.ts";

export const PRICING_RULES_VERSION = "2026-09-01.1";

export interface FactForPricing {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
}

export type PricingDecisionOutput =
  | {
      status: "recommended";
      recommendedOption: { key: string; name: string; type: CatalogService["type"]; priceDisplay: string; includedServices: string[] };
      alternativeOptions: { key: string; name: string; priceDisplay: string }[];
      rationale: string;
    }
  | {
      status: "pricing_review_required";
      reason: string;
    };

const PERSONAL_CARE_FIELDS = [
  "daily_life.bathing",
  "daily_life.toileting",
  "daily_life.continence",
  "daily_life.transfers",
  "daily_life.grooming",
  "mobility_safety.recent_falls",
];

const LIGHT_TASK_FIELDS = [
  "daily_life.medication_reminders",
  "daily_life.housekeeping",
  "daily_life.laundry",
  "daily_life.transportation_errands",
  "daily_life.meal_preparation",
];

const CHECK_IN_ONLY_FIELDS = ["daily_life.companionship_social", "daily_life.medication_reminders"];

function confirmedCount(facts: FactForPricing[], fieldPaths: string[]): number {
  const confirmed = new Set(
    facts.filter((f) => f.assertionState === "confirmed_yes").map((f) => f.fieldPath)
  );
  return fieldPaths.filter((fp) => confirmed.has(fp)).length;
}

function parseDurationMinutes(facts: FactForPricing[]): number | null {
  const durationFact = facts.find((f) => f.fieldPath === "when.duration" && f.assertionState === "confirmed_yes");
  if (!durationFact || typeof durationFact.value !== "string") return null;
  const text = durationFact.value.toLowerCase();
  if (/\b(one|1)[-\s]?hour\b|\b60[-\s]?minute/.test(text)) return 60;
  if (/\b45[-\s]?minute/.test(text)) return 45;
  if (/\b30[-\s]?minute/.test(text)) return 30;
  if (/\b20[-\s]?minute/.test(text)) return 20;
  if (/\b10[-\s]?minute/.test(text)) return 10;
  return null;
}

function priceDisplay(option: CatalogService): string {
  if (option.type === "a_la_carte") return `$${option.unitPrice}/${option.unit}`;
  const parts: string[] = [];
  if (option.dailyPrice) parts.push(`$${option.dailyPrice}/day`);
  if (option.monthlyPrice) parts.push(`$${option.monthlyPrice.toLocaleString()}/month`);
  return parts.join(" or ");
}

export function recommendPricing(facts: FactForPricing[]): PricingDecisionOutput {
  const durationMinutes = parseDurationMinutes(facts);
  const personalCareScore = confirmedCount(facts, PERSONAL_CARE_FIELDS);
  const lightTaskScore = confirmedCount(facts, LIGHT_TASK_FIELDS);
  const checkInOnlyScore = confirmedCount(facts, CHECK_IN_ONLY_FIELDS);

  // A duration explicitly stated beyond the published a la carte range doesn't map safely —
  // no invented custom rate.
  if (durationMinutes !== null && durationMinutes > 45) {
    return {
      status: "pricing_review_required",
      reason: `Requested visit length (${durationMinutes} minutes) exceeds the published 45-minute maximum a la carte duration. Serve must quote this manually.`,
    };
  }

  let recommended: CatalogService | null = null;
  let rationale = "";

  if (durationMinutes === 45 || durationMinutes === 40) {
    recommended = A_LA_CARTE.deluxe;
    rationale = "Requested visit length matches Deluxe Service's published duration.";
  } else if (personalCareScore >= 2) {
    recommended = A_LA_CARTE.comfort;
    rationale = "Multiple confirmed personal-care needs (bathing, toileting, transfers, mobility, or continence support) align with Comfort Service.";
  } else if (lightTaskScore >= 2) {
    recommended = A_LA_CARTE.essential;
    rationale = "Multiple confirmed light-support needs (medication reminders, housekeeping, errands, or meal prep) align with Essential Service.";
  } else if (checkInOnlyScore >= 1 && personalCareScore === 0 && lightTaskScore <= 1) {
    recommended = A_LA_CARTE.touchPoint;
    rationale = "Confirmed needs are limited to brief check-ins/reassurance, aligning with Touch Point Service.";
  }

  if (!recommended) {
    return {
      status: "pricing_review_required",
      reason: "Approved facts do not clearly map to a published service tier — not enough confirmed needs to recommend one option confidently, and nothing in this engine invents a rate to fill the gap.",
    };
  }

  const alternativeOptions: { key: string; name: string; priceDisplay: string }[] = [];
  if (recommended.key !== "deluxe") {
    alternativeOptions.push({ key: "deluxe", name: A_LA_CARTE.deluxe.name, priceDisplay: priceDisplay(A_LA_CARTE.deluxe) });
  }
  if (personalCareScore >= 1) {
    alternativeOptions.push({
      key: "activeLifestyle",
      name: PACKAGES.activeLifestyle.name,
      priceDisplay: priceDisplay(PACKAGES.activeLifestyle),
    });
  }

  return {
    status: "recommended",
    recommendedOption: {
      key: recommended.key,
      name: recommended.name,
      type: recommended.type,
      priceDisplay: priceDisplay(recommended),
      includedServices: recommended.includedServices,
    },
    alternativeOptions,
    rationale,
  };
}

export { PRICING_CATALOG_VERSION };
