// Approved assessment facts → SENT (to a specific AxisCare client-create field) or NOT SENT (with
// one deterministic reason). Pure; no I/O.
//
// The approved Serve assessment is richer than AxisCare's client-create contract
// (lib/integrations/axiscare/clientCreateRequest.ts). This module makes the difference explicit
// instead of silently dropping information. Every field in the canonical registry
// (domainRegistry.ts FIELD_REGISTRY) resolves to exactly one outcome — a test enforces that — so a
// newly added assessment field can't fall through unclassified.
//
// "SENT" is decided against the ACTUAL built payload, not just this map: a fact counts as sent only
// if the payload really carries its value in the mapped destination (e.g. a street address that
// AxisCare can't accept without city/state/ZIP is reported as not sent, with that reason).
//
// Only facts that reach this module are approved facts from the current approved assessment; Leave
// Unknown / Needs follow-up never become approved facts, and uncertain/conflicting states are
// filtered out before this (axiscarePreviewSource.ts approvedFactsForCurrentAssessment).

import { FIELD_REGISTRY, getFieldDefinition } from "./domainRegistry.ts";
import type { AxisCareClientCreateRequest } from "../integrations/axiscare/clientCreateRequest.ts";

export type NotSentReason =
  | "care_plan"
  | "narrative"
  | "contact"
  | "serve_only"
  | "unknown_axiscare_capability"
  | "incomplete_for_axiscare";

export const NOT_SENT_REASON_LABELS: Readonly<Record<NotSentReason, string>> = {
  care_plan: "Care plan / services — AxisCare care-plan (ADL) mapping not built yet",
  narrative: "Narrative / clinical context — no structured AxisCare client field",
  contact: "Contacts — responsible party / physician not part of AxisCare client create",
  serve_only: "Serve-only information",
  unknown_axiscare_capability: "AxisCare destination not established",
  incomplete_for_axiscare: "Incomplete for AxisCare — AxisCare needs street, city, state and ZIP together",
};

/** AxisCare client-create destinations established by the current contract. */
export const AXISCARE_CREATE_DESTINATIONS: Readonly<Record<string, string>> = {
  "identity.preferred_name": "goesBy",
  "identity.date_of_birth": "dateOfBirth",
  "identity.phone": "homePhone",
  "identity.email": "personalEmail",
  "residence.address_line1": "residentialAddress.streetAddress1",
  "residence.apartment_unit": "residentialAddress.streetAddress2",
  "residence.city": "residentialAddress.city",
  "residence.state": "residentialAddress.state",
  "residence.postal_code": "residentialAddress.postalCode",
};

const DOMAIN_NOT_SENT_REASON: Readonly<Record<string, NotSentReason>> = {
  important_people: "contact",
  what_why: "narrative",
  daily_life: "care_plan",
  mobility_safety: "narrative",
  vision_hearing: "narrative",
  cognition: "narrative",
  health: "narrative",
  advance_planning: "unknown_axiscare_capability",
  when: "unknown_axiscare_capability",
  serve_relationship_intelligence: "serve_only",
  identity: "unknown_axiscare_capability",
  residence: "unknown_axiscare_capability",
};

/** Per-field exceptions to the domain default (explicit, reviewed choices). */
const FIELD_NOT_SENT_REASON: Readonly<Record<string, NotSentReason>> = {
  // Caregiver equipment / aids used while delivering care → care-plan instructions.
  "mobility_safety.walker": "care_plan",
  "mobility_safety.cane": "care_plan",
  "mobility_safety.wheelchair": "care_plan",
  "mobility_safety.shower_equipment": "care_plan",
  "mobility_safety.transfer_lift_equipment": "care_plan",
  "vision_hearing.glasses": "care_plan",
  "vision_hearing.hearing_aids": "care_plan",
  // Sales/relationship context, not care information.
  "what_why.acceptance_of_care": "serve_only",
  // Partner community: no confirmed AxisCare create field (already an integration gap).
  "residence.community": "unknown_axiscare_capability",
  "residence.residence_type": "unknown_axiscare_capability",
};

export function notSentReasonForField(fieldPath: string): NotSentReason {
  return FIELD_NOT_SENT_REASON[fieldPath] ?? DOMAIN_NOT_SENT_REASON[fieldPath.split(".")[0]] ?? "unknown_axiscare_capability";
}

export interface ClassifiableApprovedFact {
  fieldPath: string;
  assertionState: string;
  value: unknown;
}

export interface SentFact {
  fieldPath: string;
  label: string;
  destination: string;
  value: unknown;
}

export interface NotSentFact {
  fieldPath: string;
  label: string;
  reason: NotSentReason;
  value: unknown;
  assertionState: string;
}

function payloadValueAt(payload: AxisCareClientCreateRequest | null, destination: string): unknown {
  if (!payload) return undefined;
  if (destination.startsWith("residentialAddress.")) {
    const address = payload.residentialAddress;
    return address ? (address as Record<string, unknown>)[destination.split(".")[1]] : undefined;
  }
  return (payload as Record<string, unknown>)[destination];
}

/** Deterministic: output order follows the canonical registry order, then any unknown field paths
 * alphabetically. */
export function classifyApprovedFactsForAxisCare(input: {
  facts: readonly ClassifiableApprovedFact[];
  payload: AxisCareClientCreateRequest | null;
}): { sent: SentFact[]; notSent: NotSentFact[]; mappableWithoutPayload: SentFact[] } {
  const order = new Map(FIELD_REGISTRY.map((f, i) => [f.fieldPath, i]));
  const sorted = [...input.facts].sort(
    (a, b) => (order.get(a.fieldPath) ?? Infinity) - (order.get(b.fieldPath) ?? Infinity) || a.fieldPath.localeCompare(b.fieldPath)
  );
  const sent: SentFact[] = [];
  const notSent: NotSentFact[] = [];
  // Facts that map to a supported AxisCare field, when NO payload can be built right now (e.g. an
  // update, which isn't implemented, or a hard blocker): neither "sent" nor genuinely "not sent".
  const mappableWithoutPayload: SentFact[] = [];
  for (const fact of sorted) {
    const label = getFieldDefinition(fact.fieldPath)?.label ?? fact.fieldPath;
    const destination = AXISCARE_CREATE_DESTINATIONS[fact.fieldPath];
    if (destination && input.payload === null) {
      mappableWithoutPayload.push({ fieldPath: fact.fieldPath, label, destination, value: fact.value });
      continue;
    }
    if (destination) {
      const carried = payloadValueAt(input.payload, destination);
      if (carried !== undefined && carried !== null && carried === fact.value) {
        sent.push({ fieldPath: fact.fieldPath, label, destination, value: fact.value });
        continue;
      }
      const isAddressPart = destination.startsWith("residentialAddress.");
      notSent.push({
        fieldPath: fact.fieldPath,
        label,
        reason: isAddressPart && input.payload && !input.payload.residentialAddress ? "incomplete_for_axiscare" : "serve_only",
        value: fact.value,
        assertionState: fact.assertionState,
      });
      continue;
    }
    notSent.push({ fieldPath: fact.fieldPath, label, reason: notSentReasonForField(fact.fieldPath), value: fact.value, assertionState: fact.assertionState });
  }
  return { sent, notSent, mappableWithoutPayload };
}
