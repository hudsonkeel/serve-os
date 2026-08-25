// Approved-fact -> AxisCare responsible-party mapping (Phase 6). DRY-RUN / PREVIEW ONLY — see
// clientCandidateMapping.ts's header for the same standing caveats (no HTTP write, read-only
// policy still authoritative). Maps to PUT /api/clients/{clientId}/responsibleParties/
// {listNumber} — a fixed-slot update (1=Primary/2=Secondary/3=Tertiary), never a create.
//
// CRITICAL — never infer legal/regulatory authority. hipaaDisclosureAuthorization and
// canMakeMedicalDecisions are populated ONLY from important_people.hipaa_disclosure_authorization
// / important_people.medical_decision_authority, and ONLY when those specific facts are
// confirmed_yes or confirmed_no — never derived from important_people.decision_maker or any
// other "general involvement" signal. See domainRegistry.ts's comment on those two fields and
// extractionPrompt.ts's dedicated rule 7.

import type { AssertionState } from "../../assessmentIntelligence/factTypes.ts";
import type { AxisCareResponsiblePartyWrite } from "./clientWritePayloadTypes.ts";
import type { FieldMappingState, MappedField } from "./clientCandidateMapping.ts";

export interface ApprovedFactForResponsibleParty {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
}

export interface ResponsiblePartyCandidate {
  listNumber: 1; // Serve's domain registry has exactly one "primary contact" concept today — see
  // Phase 12's field matrix. Multiple responsible parties (slots 2/3) are not yet representable
  // in the assessment domain model; this always targets slot 1 (Primary) only.
  payload: AxisCareResponsiblePartyWrite;
  fieldStates: MappedField[];
}

function confirmed(facts: ApprovedFactForResponsibleParty[], fieldPath: string): { value: unknown; assertionState: AssertionState } | null {
  const fact = facts.find((f) => f.fieldPath === fieldPath && (f.assertionState === "confirmed_yes" || f.assertionState === "confirmed_no"));
  return fact ? { value: fact.value, assertionState: fact.assertionState } : null;
}

function push(fieldStates: MappedField[], axisCareField: string, state: FieldMappingState, serveFieldPath: string | null, value: unknown, note: string) {
  fieldStates.push({ axisCareField, state, serveFieldPath, value, note });
}

export function buildResponsiblePartyCandidate(approvedFacts: ApprovedFactForResponsibleParty[]): ResponsiblePartyCandidate {
  const fieldStates: MappedField[] = [];
  const payload: AxisCareResponsiblePartyWrite = {};

  const name = confirmed(approvedFacts, "important_people.primary_contact_name");
  if (name) {
    payload.name = String(name.value);
    push(fieldStates, "name", "READY", "important_people.primary_contact_name", name.value, "");
  } else {
    push(fieldStates, "name", "MISSING_OPTIONAL", "important_people.primary_contact_name", null, "");
  }

  const relationship = confirmed(approvedFacts, "important_people.primary_contact_relationship");
  if (relationship) {
    payload.relationship = String(relationship.value);
    push(fieldStates, "relationship", "READY", "important_people.primary_contact_relationship", relationship.value, "");
  } else {
    push(fieldStates, "relationship", "MISSING_OPTIONAL", "important_people.primary_contact_relationship", null, "");
  }

  const phone = confirmed(approvedFacts, "important_people.primary_contact_phone");
  if (phone) {
    payload.phones = [{ listNumber: 1, type: null, number: String(phone.value) }];
    push(fieldStates, "phones", "READY", "important_people.primary_contact_phone", phone.value, "Phone type (Home/Mobile/etc.) is unknown — Serve does not capture a contact phone type, sent as null rather than guessed.");
  } else {
    push(fieldStates, "phones", "MISSING_OPTIONAL", "important_people.primary_contact_phone", null, "");
  }

  // No corresponding Serve fields at all — real domain-model gaps, not oversights in this mapper.
  push(fieldStates, "email", "UNSUPPORTED", null, null, "Serve's domain registry has no responsible-party email field (identity.email belongs to the resident, not the contact).");
  push(fieldStates, "address", "UNSUPPORTED", null, null, "Serve's domain registry has no responsible-party address field.");
  push(fieldStates, "dateOfBirth", "UNSUPPORTED", null, null, "Serve's domain registry has no responsible-party date-of-birth field.");

  // Authority fields — explicit-only, never inferred, matching the domain registry's own
  // comment and extractionPrompt.ts's dedicated rule.
  const hipaa = confirmed(approvedFacts, "important_people.hipaa_disclosure_authorization");
  if (hipaa) {
    payload.hipaaDisclosureAuthorization = hipaa.assertionState === "confirmed_yes";
    push(fieldStates, "hipaaDisclosureAuthorization", "READY", "important_people.hipaa_disclosure_authorization", hipaa.assertionState === "confirmed_yes", "Populated only because this fact was explicitly, separately confirmed — never inferred from decision_maker or general involvement language.");
  } else {
    push(fieldStates, "hipaaDisclosureAuthorization", "MISSING_OPTIONAL", "important_people.hipaa_disclosure_authorization", null, "Not explicitly stated in this assessment. Left unset — unknown stays unknown, never defaulted to false or inferred from other facts.");
  }

  const medicalAuthority = confirmed(approvedFacts, "important_people.medical_decision_authority");
  if (medicalAuthority) {
    payload.canMakeMedicalDecisions = medicalAuthority.assertionState === "confirmed_yes";
    push(fieldStates, "canMakeMedicalDecisions", "READY", "important_people.medical_decision_authority", medicalAuthority.assertionState === "confirmed_yes", "Populated only because this fact was explicitly, separately confirmed — never inferred from decision_maker or general involvement language.");
  } else {
    push(fieldStates, "canMakeMedicalDecisions", "MISSING_OPTIONAL", "important_people.medical_decision_authority", null, "Not explicitly stated in this assessment. Left unset — unknown stays unknown, never defaulted to false or inferred from other facts.");
  }

  return { listNumber: 1, payload, fieldStates };
}
