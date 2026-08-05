// same_import_duplicate detection — answers "did the same import event
// write the same person more than once?" Deliberately narrower than
// identity resolution's name-similarity signals (lib/residents/identity/
// identitySignals.ts): requires an EXACT normalized-name match plus same
// apartment plus same source system plus phone-compatibility, because this
// is meant to explain an import mechanics defect, not resolve genuine
// spelling-variant uncertainty — that stays in /resident-identities. Pure,
// no I/O.
import { normalizeFullName, normalizeNamePart } from "../identity/normalization.ts";
import { normalizeUnit } from "../roster/normalization.ts";
import { validatePhoneForStorage } from "./phoneNormalization.ts";
import type { IntegrityEvidenceSignal, ResidentForIntegrityDetection } from "./types.ts";

export function detectSameImportDuplicate(a: ResidentForIntegrityDetection, b: ResidentForIntegrityDetection): IntegrityEvidenceSignal[] {
  const fullNameA = normalizeFullName(a.firstName, a.lastName);
  const fullNameB = normalizeFullName(b.firstName, b.lastName);
  if (!fullNameA || fullNameA !== fullNameB) return [];

  const unitA = normalizeUnit(a.unitNumber);
  const unitB = normalizeUnit(b.unitNumber);
  if (unitA === "" || unitA !== unitB) return [];

  if (!a.sourceSystem || a.sourceSystem !== b.sourceSystem) return [];

  const phoneA = validatePhoneForStorage(a.phone).normalized;
  const phoneB = validatePhoneForStorage(b.phone).normalized;
  const bothBlank = phoneA === null && phoneB === null;
  const samePhone = phoneA !== null && phoneA === phoneB;
  if (!bothBlank && !samePhone) return [];

  const signals: IntegrityEvidenceSignal[] = [
    {
      signalType: "same_normalized_name",
      description: `Both records normalize to the exact same name ("${fullNameA}").`,
    },
    {
      signalType: "same_apartment",
      description: `Both records list apartment ${a.unitNumber}.`,
    },
    {
      signalType: "same_source_system",
      description: `Both records came from the same source system (${a.sourceSystem}).`,
    },
  ];

  signals.push(
    samePhone
      ? { signalType: "same_phone", description: "Both records share the same phone number." }
      : { signalType: "both_phone_blank", description: "Neither record has a phone number on file." },
  );

  if (a.importBatch && a.importBatch === b.importBatch) {
    signals.push({
      signalType: "same_import_batch",
      description: `Both records were written by the same import batch (${a.importBatch}).`,
    });
  }

  // Conflicting middle name is real evidence these are two DIFFERENT
  // people who happen to share first/last/apartment/source (e.g. a parent
  // and child living together with the same name) — "no evidence they are
  // distinct people" is a requirement of this signal, not an afterthought,
  // so a conflict here means this pair is NOT a same_import_duplicate at
  // all (never claimed away from identity/household evaluation).
  const middleA = normalizeNamePart(a.middleName);
  const middleB = normalizeNamePart(b.middleName);
  if (middleA && middleB && middleA !== middleB) {
    return [];
  }

  return signals;
}
