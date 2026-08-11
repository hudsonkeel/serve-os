// Deterministic pricing catalog — versioned data, not prose embedded in a prompt. Ported and
// modernized from the old Serve Intake MVP's pricingRules.js (same published rates/services),
// adapted to Serve OS's field-based fact model. AI may explain why a recommended option fits;
// it never computes or invents a price — see docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §5.

export const PRICING_CATALOG_VERSION = "2026-09-01.1";

export interface CatalogService {
  key: string;
  name: string;
  type: "a_la_carte" | "package";
  unitPrice?: number;
  unit?: string;
  dailyPrice?: number;
  monthlyPrice?: number;
  durationLabel?: string;
  includedServices: string[];
}

export const A_LA_CARTE: Record<string, CatalogService> = {
  touchPoint: {
    key: "touchPoint",
    name: "Touch Point Service",
    type: "a_la_carte",
    unitPrice: 15,
    unit: "visit",
    durationLabel: "Up to 10 minutes",
    includedServices: ["Quick check-in", "Safety sweep", "Medication/activity reminders"],
  },
  essential: {
    key: "essential",
    name: "Essential Service",
    type: "a_la_carte",
    unitPrice: 25,
    unit: "visit",
    durationLabel: "Up to 20 minutes",
    includedServices: ["Safety sweep", "Medication reminders", "Bed making / sheet changes", "Escort to meals/activities"],
  },
  comfort: {
    key: "comfort",
    name: "Comfort Service",
    type: "a_la_carte",
    unitPrice: 35,
    unit: "visit",
    durationLabel: "Up to 30 minutes",
    includedServices: ["Safety sweep", "Dressing", "Grooming", "Toileting", "Mobility", "Shower assistance", "Medication reminders"],
  },
  deluxe: {
    key: "deluxe",
    name: "Deluxe Service",
    type: "a_la_carte",
    unitPrice: 45,
    unit: "visit",
    durationLabel: "Up to 45 minutes",
    includedServices: ["Longer shower/grooming routines", "Multiple personal care tasks", "Additional mobility/dressing assistance"],
  },
};

export const PACKAGES: Record<string, CatalogService> = {
  touchPoint: {
    key: "touchPoint",
    name: "Touch Point Package",
    type: "package",
    dailyPrice: 38,
    monthlyPrice: 990,
    includedServices: ["3 Touch Point Services daily", "Monthly socials with one guest", "Membership card"],
  },
  activeLifestyle: {
    key: "activeLifestyle",
    name: "Active Lifestyle Package",
    type: "package",
    dailyPrice: 68,
    monthlyPrice: 1990,
    includedServices: ["3 Essential Services daily OR 2 Comfort Services daily", "Monthly socials with one guest", "Membership card"],
  },
  elite: {
    key: "elite",
    name: "Elite Package",
    type: "package",
    dailyPrice: 110,
    monthlyPrice: 2990,
    includedServices: ["2 Comfort Services daily", "3 Essential Services daily", "Monthly socials with one guest"],
  },
  peaceOfMind: {
    key: "peaceOfMind",
    name: "Peace of Mind Package",
    type: "package",
    dailyPrice: 140,
    monthlyPrice: 3990,
    includedServices: ["2 Comfort Services daily", "2 Essential Services daily", "3 Touch Point Services daily"],
  },
};
