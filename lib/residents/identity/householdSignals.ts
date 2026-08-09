// Household evidence generation — answers a different question than
// identity evidence: "do these residents likely share a household?" Never
// imported by anything that computes identity confidence — see
// lib/residents/identity/confidenceBands.ts for where that separation is
// enforced structurally. Consumed both by candidate detection (as
// corroborating context on an identity candidate) and by household-link
// detection (as the sole evidence for a standalone household link).
import { normalizeUnit } from "../roster/normalization.ts";
import { normalizeNamePart, normalizePhone } from "./normalization.ts";
import type { HouseholdEvidenceSignal, LiveResidentForIdentity } from "./types.ts";

export function generateHouseholdSignals(a: LiveResidentForIdentity, b: LiveResidentForIdentity): HouseholdEvidenceSignal[] {
  const signals: HouseholdEvidenceSignal[] = [];

  const unitA = normalizeUnit(a.unitNumber);
  const unitB = normalizeUnit(b.unitNumber);
  const sameApartment = unitA !== "" && unitA === unitB;
  if (sameApartment) {
    signals.push({
      signalType: "same_apartment",
      residentIdA: a.id,
      residentIdB: b.id,
      description: `Both records list the same current apartment (${a.unitNumber}).`,
    });
  }

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  const samePhone = Boolean(phoneA) && phoneA === phoneB;
  if (samePhone) {
    signals.push({
      signalType: "same_phone",
      residentIdA: a.id,
      residentIdB: b.id,
      description: `Both records share the same phone number.`,
    });
  }

  const familyNameA = normalizeNamePart(a.familyContactName);
  const familyNameB = normalizeNamePart(b.familyContactName);
  const familyPhoneA = normalizePhone(a.familyContactPhone);
  const familyPhoneB = normalizePhone(b.familyContactPhone);
  const sharedFamilyContact = (familyPhoneA !== null && familyPhoneA === familyPhoneB) || (familyNameA !== "" && familyNameA === familyNameB);
  if (sharedFamilyContact) {
    signals.push({
      signalType: "shared_family_contact",
      residentIdA: a.id,
      residentIdB: b.id,
      description: `Both records list the same family/emergency contact ("${a.familyContactName ?? a.familyContactPhone}").`,
    });
  }

  // Same building is real evidence in a MULTI-building community, but in a
  // single-building (or mostly-one-building) community it fires for nearly
  // every pair and would drown out every genuine signal — it must never be
  // a freestanding signal. Only meaningful as ADDITIONAL corroboration on
  // top of an already-established, more specific household signal (same
  // apartment, same phone, or a shared family contact), exactly like
  // `apartment_differs` was gated in the identity engine.
  const hasSpecificHouseholdSignal = sameApartment || samePhone || sharedFamilyContact;
  if (!sameApartment && hasSpecificHouseholdSignal && a.building && b.building && a.building === b.building && a.communityCode && a.communityCode === b.communityCode) {
    signals.push({
      signalType: "same_building_and_community",
      residentIdA: a.id,
      residentIdB: b.id,
      description: `Both records are in the same building ("${a.building}") within the same community, though not the same apartment.`,
    });
  }

  return signals;
}
