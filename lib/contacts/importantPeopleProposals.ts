// Assessment -> canonical Important People proposal generation (Slice C.3, 2026-09-19).
//
// Groups approved-assessment field paths into PEOPLE rather than treating each field path as an
// independent fact — the core problem this slice exists to solve (see the Slice C.1
// investigation): Susan Carter appearing as BOTH `important_people.primary_contact_name` and
// `important_people.decision_maker` must produce ONE proposed person with two roles, never two
// unrelated proposed people.
//
// Pure, read-only, I/O-free: takes already-fetched approved facts and returns proposals only.
// Never writes anything, never touches assessment_draft_facts/assessment_approved_facts/the
// immutable assessment_document snapshot — this module doesn't even have a database handle to do
// so. The eventual write path (lib/actions/importantPeople.ts) is a separate, later step over this
// module's OUTPUT — automatic for safe/unambiguous cases, human-reviewed for ambiguous ones (Slice
// C.3 refinement, 2026-09-19) — never triggered by computing it.
//
// PHYSICIAN IS DELIBERATELY EXCLUDED (Slice C.3 product decision, documented per the task's own
// instruction): `important_people.physician_name`/`physician_phone` are NOT inspected here.
// Physician contact already has an established, governed home — `residents.physician_name/phone`,
// consumed directly by Client Readiness's CR_CLIENT_PROFILE_ON_FILE requirement — and a
// physician's relationship to a resident (a professional/clinical relationship) has different
// operational semantics from a family/legal-authority "Important Person" (a POA, decision maker,
// emergency contact). Introducing a second, canonical-contact-based physician representation
// alongside the existing governed one would create exactly the "confusing duplicate
// representation" the task explicitly warns against, with no clear present-day product need to
// justify it. Deferred, not forgotten — a future slice can revisit this once/if a real reason
// (e.g. physician-facing document routing) emerges.

import { classifyContactMatch, type ContactForMatching } from "./identityMatch.ts";
import { normalizeContactPhone } from "./normalization.ts";

export interface ApprovedFactForProposal {
  /** assessment_approved_facts.id — the stable, unique key used for both display provenance and
   * write-time idempotency (lib/actions/importantPeople.ts checks contact_roles/contact_field_
   * provenance.source_reference against this exact id before writing anything). */
  readonly id: string;
  readonly fieldPath: string;
  readonly value: unknown;
  readonly assertionState: string;
}

export interface ImportantPersonRoleProposal {
  /** "primary_contact" | "decision_maker" | "emergency_contact" | "medical_poa" |
   * "financial_poa" | "relationship:<free text>" — see roleTypes.ts's own comment on why
   * relationship-to-resident (e.g. "daughter") is represented as a role_type value with a
   * "relationship:" prefix rather than a new contact_roles column: it is inherently
   * resident-relative (Susan is Margaret's daughter, not "a daughter" in the abstract), so it
   * belongs on the resident-scoped contact_roles table, and role_type is deliberately open-ended
   * text specifically so a new kind of role value never requires a schema migration. */
  readonly roleType: string;
  readonly sourceApprovedFactId: string;
  readonly sourceFieldPath: string;
}

export interface ProposedImportantPerson {
  /** Stable only for this one computation (e.g. for a React list key) — never persisted, never a
   * database id. Derived from the sorted set of contributing approved-fact ids, so it stays
   * stable across re-renders of the same underlying data. */
  readonly proposalKey: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  /** The exact string as captured, before the first/last split — always safe to display when the
   * split itself is uncertain (see splitFullName's own comment). */
  readonly rawFullName: string;
  readonly nameSourceApprovedFactId: string;
  readonly nameSourceFieldPath: string;
  readonly phone: string | null;
  readonly normalizedPhone: string | null;
  readonly phoneSourceApprovedFactId: string | null;
  readonly phoneSourceFieldPath: string | null;
  readonly roles: readonly ImportantPersonRoleProposal[];
}

export interface UnattachedPoaClaim {
  readonly roleType: "medical_poa" | "financial_poa";
  readonly sourceApprovedFactId: string;
  readonly sourceFieldPath: string;
}

export interface ImportantPeopleProposalResult {
  readonly people: readonly ProposedImportantPerson[];
  /** A medical/financial POA was confirmed on the resident, but no decision-maker person was
   * captured to attach it to — surfaced explicitly rather than silently dropped or guessed onto
   * the wrong person. */
  readonly unattachedPoaClaims: readonly UnattachedPoaClaim[];
}

function confirmedFact(facts: readonly ApprovedFactForProposal[], fieldPath: string): ApprovedFactForProposal | null {
  return (
    facts.find(
      (f) => f.fieldPath === fieldPath && (f.assertionState === "confirmed_yes" || f.assertionState === "confirmed_no")
    ) ?? null
  );
}

function confirmedStringField(
  facts: readonly ApprovedFactForProposal[],
  fieldPath: string
): { value: string; approvedFactId: string; fieldPath: string } | null {
  const fact = confirmedFact(facts, fieldPath);
  if (!fact || typeof fact.value !== "string" || fact.value.trim().length === 0) return null;
  return { value: fact.value, approvedFactId: fact.id, fieldPath: fact.fieldPath };
}

/** Best-effort first/last name split from a single free-text full name string — a disclosed
 * v0.1 simplification, not a robust name parser (it does not handle multi-word last names,
 * suffixes, or cultural naming order correctly in every case). Everything before the LAST
 * whitespace-separated token becomes the first name; the last token becomes the last name. A
 * single-token name has no last name at all, never a guessed one. */
export function splitFullName(fullName: string): { firstName: string | null; lastName: string | null } {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: null, lastName: null };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: null };
  return { firstName: tokens.slice(0, -1).join(" "), lastName: tokens[tokens.length - 1] };
}

interface PersonSlot {
  readonly name: { value: string; approvedFactId: string; fieldPath: string };
  readonly phone: { value: string; approvedFactId: string; fieldPath: string } | null;
  readonly roles: ImportantPersonRoleProposal[];
}

function buildSlot(
  facts: readonly ApprovedFactForProposal[],
  roleType: string,
  nameFieldPath: string,
  relationshipFieldPath: string | null,
  phoneFieldPath: string | null
): PersonSlot | null {
  const name = confirmedStringField(facts, nameFieldPath);
  if (!name) return null;
  const relationship = relationshipFieldPath ? confirmedStringField(facts, relationshipFieldPath) : null;
  const phone = phoneFieldPath ? confirmedStringField(facts, phoneFieldPath) : null;
  const roles: ImportantPersonRoleProposal[] = [
    { roleType, sourceApprovedFactId: name.approvedFactId, sourceFieldPath: name.fieldPath },
  ];
  if (relationship) {
    roles.push({
      roleType: `relationship:${relationship.value}`,
      sourceApprovedFactId: relationship.approvedFactId,
      sourceFieldPath: relationship.fieldPath,
    });
  }
  return { name, phone, roles };
}

function slotToContactForMatching(slot: PersonSlot): ContactForMatching {
  const { firstName, lastName } = splitFullName(slot.name.value);
  return {
    firstName,
    lastName,
    normalizedEmail: null,
    normalizedPhone: slot.phone ? normalizeContactPhone(slot.phone.value) : null,
  };
}

/** Whether two role-slots from the SAME assessment conversation, about the SAME resident, should
 * be treated as the same underlying person — a deliberately LOWER bar than
 * evaluateContactLinkForProposal's cross-system contact matching. Within one assessment about one
 * resident, a shared full name is overwhelmingly likely to be the same referent (there is no
 * realistic risk of two unrelated strangers coincidentally sharing an identical full name within
 * one family's own conversation, unlike matching a name against the whole system's contact
 * roster). Only a genuine CONFLICT between the two slots' own strong identifiers — a differing
 * phone number each side explicitly stated — overrides this and keeps them separate, exactly
 * mirroring classifyContactMatch's own "conflicts always downgrade" discipline at this different
 * starting threshold. */
function slotsAreSameProposedPerson(a: PersonSlot, b: PersonSlot): boolean {
  const tier = classifyContactMatch(slotToContactForMatching(a), slotToContactForMatching(b)).tier;
  return tier === "exact_strong_match" || tier === "name_only_no_merge";
}

function groupSlotsIntoPeople(slots: readonly PersonSlot[]): PersonSlot[][] {
  const groups: PersonSlot[][] = [];
  for (const slot of slots) {
    const existingGroup = groups.find((group) => group.every((member) => slotsAreSameProposedPerson(member, slot)));
    if (existingGroup) {
      existingGroup.push(slot);
    } else {
      groups.push([slot]);
    }
  }
  return groups;
}

function mergeGroupIntoProposal(group: readonly PersonSlot[]): ProposedImportantPerson {
  // The first slot in processing order (primary_contact, then decision_maker, then
  // emergency_contact — see buildImportantPeopleProposals) wins for display spelling when slots
  // within a group disagree on exact wording. This is a display simplification only — every
  // contributing fact's own approvedFactId is preserved in `roles`, so no source is lost.
  const primary = group[0];
  const { firstName, lastName } = splitFullName(primary.name.value);
  const phoneSlot = group.find((s) => s.phone)?.phone ?? null;
  return {
    proposalKey: group
      .map((s) => s.name.approvedFactId)
      .sort()
      .join("+"),
    firstName,
    lastName,
    rawFullName: primary.name.value,
    nameSourceApprovedFactId: primary.name.approvedFactId,
    nameSourceFieldPath: primary.name.fieldPath,
    phone: phoneSlot?.value ?? null,
    normalizedPhone: phoneSlot ? normalizeContactPhone(phoneSlot.value) : null,
    phoneSourceApprovedFactId: phoneSlot?.approvedFactId ?? null,
    phoneSourceFieldPath: phoneSlot?.fieldPath ?? null,
    roles: group.flatMap((s) => s.roles),
  };
}

const POA_FIELDS = [
  { fieldPath: "advance_planning.medical_poa", roleType: "medical_poa" as const },
  { fieldPath: "advance_planning.financial_poa", roleType: "financial_poa" as const },
];

/** Builds Important Person proposals from a resident's current approved facts. Never invents a
 * person from uncertainty — only confirmed_yes/confirmed_no facts with a real string value ever
 * contribute a slot (matching this codebase's "unknown must remain unknown" discipline). */
export function buildImportantPeopleProposals(facts: readonly ApprovedFactForProposal[]): ImportantPeopleProposalResult {
  const slots: PersonSlot[] = [];
  const primaryContactSlot = buildSlot(
    facts,
    "primary_contact",
    "important_people.primary_contact_name",
    "important_people.primary_contact_relationship",
    "important_people.primary_contact_phone"
  );
  if (primaryContactSlot) slots.push(primaryContactSlot);

  const decisionMakerSlot = buildSlot(
    facts,
    "decision_maker",
    "important_people.decision_maker",
    "important_people.decision_maker_relationship",
    "important_people.decision_maker_phone"
  );
  if (decisionMakerSlot) slots.push(decisionMakerSlot);

  const emergencyContactSlot = buildSlot(facts, "emergency_contact", "important_people.emergency_contact", null, null);
  if (emergencyContactSlot) slots.push(emergencyContactSlot);

  const groups = groupSlotsIntoPeople(slots);
  const people = groups.map(mergeGroupIntoProposal);

  // POA attachment: coverage.ts's own poaMentioned() trigger already treats "decision maker" as
  // the implicit POA-holder proxy (it fires the decision_maker_details conditional topic whenever
  // a medical/financial POA is confirmed) — this reuses that same existing convention explicitly
  // rather than inventing a new one. A POA confirmed with no decision-maker slot captured has no
  // person to attach to and is surfaced as an unattached claim instead of guessed onto the wrong
  // person or silently dropped.
  const unattachedPoaClaims: UnattachedPoaClaim[] = [];
  for (const { fieldPath, roleType } of POA_FIELDS) {
    const poaFact = confirmedFact(facts, fieldPath);
    if (!poaFact || poaFact.assertionState !== "confirmed_yes") continue;
    const target = people.find((p) => p.roles.some((r) => r.roleType === "decision_maker"));
    if (target) {
      (target.roles as ImportantPersonRoleProposal[]).push({
        roleType,
        sourceApprovedFactId: poaFact.id,
        sourceFieldPath: poaFact.fieldPath,
      });
    } else {
      unattachedPoaClaims.push({ roleType, sourceApprovedFactId: poaFact.id, sourceFieldPath: poaFact.fieldPath });
    }
  }

  return { people, unattachedPoaClaims };
}
