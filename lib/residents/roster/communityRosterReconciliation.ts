// Community Roster Import + Reconciliation phase — the ONE orchestration
// layer that composes the roster-specific matcher's unit/name/alias
// evidence (matchPerson/reconcileRoster, unmodified) with Serve's newer
// canonical identity signals (identitySignals.ts — exact/near-miss name
// match, shared DOB, confirmed alias — the same evidence resident-to-
// resident duplicate detection already uses). One reconciliation
// recommendation per row comes out of this file; nothing downstream ever
// sees two competing match systems.
//
// Governing rule (explicit user instruction): the roster matcher's
// "new_resident" result means "no ROSTER-SPECIFIC candidate found" — it
// is never itself permission to create a canonical person. Every row
// still classified new_resident after canonical-signal enrichment is
// exactly the population eligible for the Create New Resident action,
// which itself re-runs a fresh duplicate check immediately before
// insertion (lib/actions/communityRosterImport.ts) — this file narrows
// that population, it never replaces that final safety check.
//
// Pass 3 identity clarifications (both explicit user instructions):
//
// 1. Cross-community overlap/move: the same person can legitimately
//    appear on two community rosters during a move or lease-overlap
//    period. A single credible cross-community candidate is now its own
//    classification, 'possible_cross_community_match' — surfaced
//    explicitly as a possible move, never silently folded into
//    'new_resident' (Pass 2's behavior) or auto-resolved. Confirming one
//    only ever adds a second identity link on the existing resident
//    (never 'primary' if a primary community_roster link already exists
//    — see confirmCommunityRosterMatch) and never touches
//    residents.community_id — both communities' roster history survives
//    side by side, exactly as instructed.
//
// 2. Exact-name collisions: name+unit agreement (the roster engine's own
//    exact_match/apartment_change tiers) is never treated as sufficient
//    on its own once real contradicting evidence is on file. Every
//    roster-tier match is now cross-checked against the SAME candidate
//    for contradicting canonical signals (today: conflicting date of
//    birth, or a confirmed alias for this exact name pointing at a
//    DIFFERENT resident) — a genuine contradiction downgrades the row to
//    'contradicted_match', routing it to explicit human review instead
//    of presenting a confident pre-selected suggestion.
//
// Pass 4 — signal inventory, audited against what the roster/parser
// actually provides (not every field this comment block once listed as
// "not wired" turned out to be available or supported):
//   - Name (exact + near-miss edit-distance + compound/middle-name
//     variant), DOB, confirmed alias: identity evidence, used for both
//     suggesting AND contradicting a candidate (identitySignals.ts).
//   - Phone: NOW wired, as HOUSEHOLD corroboration only (same_phone,
//     via generateHouseholdSignals below) — can upgrade an already-
//     nonzero identity read from "probable" to "high", exactly like the
//     existing framework's own resident-duplicate-detection path
//     already does; per that framework's own deliberate design, phone
//     can never establish or contradict identity on its own (multiple
//     different household members can share one number). Both the
//     roster row (NormalizedPerson.phoneRaw, already parsed) and the
//     candidate (residents.phone/phone_raw, now loaded by
//     loadLiveResidentsForCommunity/loadLiveResidentsExcludingCommunity)
//     are available for every format the parsers support.
//   - Apartment/unit: already the roster engine's own primary signal
//     (matchPerson's tiers); ALSO now feeds household corroboration
//     (same_apartment) for the canonical-signal candidates the roster
//     tier itself didn't find — e.g. a possible_match whose name
//     evidence is corroborated by also sharing the resident's current
//     apartment. Never fires cross-community (same_apartment requires a
//     known, equal communityId on both sides, and the cross-community
//     pass deliberately passes null for both).
//   - Email: the roster/parser DOES capture it (RawRosterRow.emailRaw,
//     both Watermere and the generic CSV/XLSX parser), and residents
//     has an email column — but NEITHER identitySignals.ts NOR
//     householdSignals.ts has ANY signal type that consumes email
//     today (no "same_email"/"conflicting_email" exists anywhere in the
//     identity/household framework). Wiring it in would mean inventing
//     new signal logic, not using the existing deterministic framework
//     — explicitly out of scope per instruction. NormalizedPerson does
//     not currently carry emailRaw through from RawRosterRow either
//     (only phoneRaw/dobRaw are threaded so far), so email is not
//     currently used or even in a position to be used.
//   - Responsible party/emergency contact, spouse/household
//     relationships, assessment/history: identitySignals.ts has no
//     signal type for any of these; householdSignals.ts's
//     shared_family_contact COULD apply if familyContactName/Phone were
//     populated on both sides, but the roster/parser never captures
//     that data and residents' own family-contact fields are not loaded
//     into the roster candidate snapshot — genuinely unsupported by the
//     current data, not merely unwired. Not a Pass 4 blocker: nothing
//     in this phase claims these signals exist.
//
// Pure — no I/O. Candidates, aliases, and existing-link lookups are all
// loaded once per run by the caller (communityRosterAnalysis.ts) and
// passed in already batched, never fetched per row.
import { generateIdentitySignals } from "../identity/identitySignals.ts";
import type { IdentitySignalContext } from "../identity/identitySignals.ts";
import { generateHouseholdSignals } from "../identity/householdSignals.ts";
import { assignConfidenceBand } from "../identity/confidenceBands.ts";
import { normalizeFullName } from "../identity/normalization.ts";
import type { ConfidenceBand, LiveResidentForIdentity } from "../identity/types.ts";
import type { ConfirmedAlias } from "../identity/types.ts";
import type { LiveResident, NormalizedPerson, PersonOutcome, PersonOutcomeClassification } from "./types.ts";

// Records the version of BOTH evidence bases this orchestration composed
// — the roster engine's own tiers never change version independently of
// this file, and lib/residents/identity/candidateDetection.ts's own
// MATCHING_RULE_VERSION ("2") is the canonical-signal generator's
// version. Bumped whenever either the composition logic below or either
// underlying engine's matching behavior changes.
export const ROSTER_RECONCILIATION_RULE_VERSION = "4";

// 'possible_match', 'contradicted_match', and 'possible_cross_community_match'
// are the only values new beyond the roster engine's own
// PersonOutcomeClassification — produced exclusively by this file, never
// by matchPerson()/reconcileRoster() themselves. See the migration
// comments (20260902300000, 20260902320000) for why these are safe to
// add to the persisted resolution_status column.
export type RosterReconciliationClassification =
  | PersonOutcomeClassification
  | "possible_match"
  | "contradicted_match"
  | "possible_cross_community_match";

export interface CanonicalCandidateSuggestion {
  readonly residentId: string;
  readonly residentName: string;
  readonly confidenceBand: ConfidenceBand;
  readonly evidenceDescriptions: readonly string[];
}

export interface RosterReconciliationOutcome {
  readonly person: NormalizedPerson;
  readonly classification: RosterReconciliationClassification;
  readonly residentId: string | null;
  readonly residentName: string | null;
  readonly priorUnit: string | null;
  readonly matchMethod: string | null;
  readonly matchConfidence: string | null;
  readonly reason: string;
  readonly ambiguousCandidateIds?: readonly string[];
  readonly directoryDiscrepancy?: string | null;
  // Informational only — never changes classification, never auto-moves
  // anyone. Set only when multiple cross-community candidates exist (so
  // none can be confidently singled out) or the single candidate found
  // was itself contradicted — a single CLEAN cross-community candidate
  // instead gets its own classification below, 'possible_cross_community_match'.
  readonly crossCommunityNote?: string | null;
  // True only for 'possible_cross_community_match' — the review UI uses
  // this to label the suggestion as a possible move/overlap rather than
  // an ordinary same-community match, and to route its confirm action
  // through the never-'primary'-if-one-exists linkRole rule.
  readonly isCrossCommunitySuggestion?: boolean;
}

function residentDisplayName(r: LiveResident): string {
  const fromParts = [r.firstName, r.lastName].filter(Boolean).join(" ");
  return fromParts || r.displayName || r.fullName || "Unnamed Resident";
}

function personAsLiveResidentForIdentity(person: NormalizedPerson, communityId: string | null): LiveResidentForIdentity {
  return {
    id: "__roster_row__",
    firstName: person.firstNameRaw,
    lastName: person.lastNameRaw,
    middleName: null,
    preferredName: null,
    displayName: null,
    fullName: null,
    unitNumber: person.apartment || null,
    building: null,
    communityCode: null,
    communityId,
    phone: person.phoneRaw,
    email: null,
    dateOfBirth: person.dobRaw ?? null,
    familyContactName: null,
    familyContactPhone: null,
    needsReview: null,
    isActive: true,
    sourceSystem: "community_roster",
    createdAt: "",
  };
}

function candidateAsLiveResidentForIdentity(r: LiveResident, communityId: string | null): LiveResidentForIdentity {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    middleName: r.middleName,
    preferredName: r.preferredName,
    displayName: r.displayName,
    fullName: r.fullName,
    unitNumber: r.unitNumber,
    building: r.building,
    communityCode: r.communityCode,
    communityId,
    phone: r.phone ?? null,
    email: null,
    dateOfBirth: r.dateOfBirth ?? null,
    familyContactName: null,
    familyContactPhone: null,
    needsReview: null,
    isActive: r.isActive,
    sourceSystem: null,
    createdAt: "",
  };
}

const EMPTY_CONTEXT: IdentitySignalContext = {
  confirmedAliases: [],
  absentResidentIds: new Set(),
  recentlyCreatedResidentIds: new Set(),
};

// Finds canonical-signal candidates for one roster person against one
// pool of live residents — returns every candidate reaching at least
// "probable" (assignConfidenceBand's own bar for a single strong,
// uncorroborated identity signal), sorted strongest first. Zero I/O.
//
// Pass 4 — household evidence (same phone, same current apartment) is
// now generated too and passed into assignConfidenceBand exactly as
// lib/residents/identity/candidateDetection.ts's own detectIdentityCandidates
// already does for resident-to-resident duplicate detection: it can only
// upgrade an ALREADY-nonzero identity read (one strong name signal +
// household corroboration -> "high"), never manufacture a band on its
// own — the existing framework's own structural guarantee, not a new
// rule invented here. same_apartment only fires when both sides share a
// known, equal communityId (see householdSignals.ts), which
// personAsLiveResidentForIdentity/candidateAsLiveResidentForIdentity
// already set correctly per call site (both real for an in-community
// check; both null for the cross-community pass) — so it structurally
// never fires across communities, exactly as intended.
function findCanonicalCandidates(
  person: NormalizedPerson,
  candidates: readonly LiveResident[],
  communityId: string | null,
  confirmedAliases: readonly ConfirmedAlias[]
): { residentId: string; residentName: string; band: ConfidenceBand; descriptions: string[] }[] {
  const rosterPersonAsResident = personAsLiveResidentForIdentity(person, communityId);
  const context: IdentitySignalContext = { ...EMPTY_CONTEXT, confirmedAliases };

  const found: { residentId: string; residentName: string; band: ConfidenceBand; descriptions: string[] }[] = [];
  for (const candidate of candidates) {
    const candidateAsResident = candidateAsLiveResidentForIdentity(candidate, communityId);
    const identitySignals = generateIdentitySignals(rosterPersonAsResident, candidateAsResident, context);
    const householdSignals = generateHouseholdSignals(rosterPersonAsResident, candidateAsResident);
    const band = assignConfidenceBand(identitySignals, householdSignals);
    if (band === "high" || band === "probable") {
      found.push({
        residentId: candidate.id,
        residentName: residentDisplayName(candidate),
        band,
        descriptions: [...identitySignals.map((s) => s.description), ...householdSignals.map((s) => s.description)],
      });
    }
  }

  // Strongest first: "high" before "probable"; ties keep discovery order
  // (candidates are already community-scoped and modestly sized — no
  // further tie-break is meaningful here).
  return found.sort((a, b) => (a.band === b.band ? 0 : a.band === "high" ? -1 : 1));
}

// Identity refinement 2 — a candidate the roster tier already matched by
// name+unit still gets checked for STRONG contradicting evidence before
// being presented as a confident suggestion:
//   - a conflicting date of birth (identitySignals.ts's own 'negative'-
//     strength 'conflicting_dob' signal — only fires when BOTH records
//     carry a DOB and they differ; silent, not a contradiction, when
//     either side has none on file, e.g. every Watermere Building-sheet
//     row).
//   - a confirmed alias for this exact normalized name that points at a
//     DIFFERENT resident than the one the roster tier matched — a prior
//     human decision on record that directly disagrees.
// Returns every contradiction description found, or null when the
// candidate is clean.
function findContradictions(
  person: NormalizedPerson,
  candidate: LiveResident,
  communityId: string | null,
  confirmedAliases: readonly ConfirmedAlias[]
): readonly string[] | null {
  const rosterPersonAsResident = personAsLiveResidentForIdentity(person, communityId);
  const candidateAsResident = candidateAsLiveResidentForIdentity(candidate, communityId);
  const context: IdentitySignalContext = { ...EMPTY_CONTEXT, confirmedAliases };
  const signals = generateIdentitySignals(rosterPersonAsResident, candidateAsResident, context);
  const descriptions = signals.filter((s) => s.strength === "negative").map((s) => s.description);

  const normalizedFullName = normalizeFullName(person.firstNameRaw, person.lastNameRaw);
  const alias = confirmedAliases.find((a) => a.normalizedValue === normalizedFullName);
  if (alias && alias.canonicalResidentId !== candidate.id) {
    descriptions.push(
      `A confirmed alias for "${person.displayLabel}" is already on record pointing to a different Serve resident — this specific candidate disagrees with that prior decision.`
    );
  }

  return descriptions.length > 0 ? descriptions : null;
}

export interface ReconcileCommunityRosterOutcomeInput {
  readonly outcome: PersonOutcome;
  // This row's own community's live residents (already excludes anyone
  // the roster engine itself already matched/considered — the same
  // snapshot reconcileRoster() was given).
  readonly communityCandidates: readonly LiveResident[];
  readonly communityId: string | null;
  // Loaded once per run, reused for every unresolved row — never a
  // per-row query (Part 2 item 4).
  readonly crossCommunityCandidates: readonly LiveResident[];
  readonly confirmedAliases: readonly ConfirmedAlias[];
}

// The single composition point: takes the roster engine's own
// PersonOutcome (unit/name-tier verdict) and returns ONE reconciliation
// recommendation, informed by canonical signals only where the roster
// engine itself found nothing. A roster-tier match/ambiguous/duplicate
// verdict is never second-guessed or overridden by canonical signals —
// the roster's own unit+name evidence is more specific to this format
// and stays authoritative whenever it has an opinion at all.
export function reconcileCommunityRosterOutcome(input: ReconcileCommunityRosterOutcomeInput): RosterReconciliationOutcome {
  const { outcome, communityCandidates, communityId, crossCommunityCandidates, confirmedAliases } = input;

  const base: RosterReconciliationOutcome = {
    person: outcome.person,
    classification: outcome.classification,
    residentId: outcome.residentId,
    residentName: outcome.residentName,
    priorUnit: outcome.priorUnit,
    matchMethod: outcome.matchMethod,
    matchConfidence: outcome.matchConfidence,
    reason: outcome.reason,
    ambiguousCandidateIds: outcome.ambiguousCandidateIds,
    directoryDiscrepancy: outcome.directoryDiscrepancy,
  };

  // ambiguous/possible_duplicate: already correctly routed to human
  // review — canonical signals cannot make an ambiguous case less
  // ambiguous, so these pass through unchanged.
  if (outcome.classification === "ambiguous" || outcome.classification === "possible_duplicate") {
    return base;
  }

  // exact_match/apartment_change: a roster-specific candidate WAS found
  // — still authoritative, UNLESS a real contradiction is on file for
  // that same candidate (identity refinement 2). Name+unit agreement is
  // never treated as sufficient on its own once contradicting evidence
  // exists.
  if (outcome.classification === "exact_match" || outcome.classification === "apartment_change") {
    const candidate = outcome.residentId ? communityCandidates.find((c) => c.id === outcome.residentId) : null;
    if (candidate) {
      const contradictions = findContradictions(outcome.person, candidate, communityId, confirmedAliases);
      if (contradictions) {
        return {
          ...base,
          classification: "contradicted_match",
          matchConfidence: "low",
          reason: `The roster's own apartment/name match suggested ${outcome.residentName ?? "this resident"}, but contradicting evidence is on file: ${contradictions.join(" ")} Review carefully before confirming.`,
        };
      }
    }
    return base;
  }

  // 'conflict'/'skipped' are declared on the shared roster-engine type
  // but never actually produced by reconcileRoster() today — passed
  // through unchanged, same as before this file added any of the above
  // branches, rather than being pulled into the new_resident-only logic
  // below.
  if (outcome.classification !== "new_resident") {
    return base;
  }

  // "new_resident" from the roster engine means only "no roster-specific
  // (unit/name-tier) candidate found" — check canonical signals before
  // treating this as a real new-person candidate.
  const inCommunity = findCanonicalCandidates(outcome.person, communityCandidates, communityId, confirmedAliases);

  if (inCommunity.length === 1) {
    const match = inCommunity[0];
    return {
      ...base,
      classification: "possible_match",
      residentId: match.residentId,
      residentName: match.residentName,
      matchMethod: null,
      matchConfidence: match.band === "high" ? "medium" : "low",
      reason: `No roster-specific (unit/name) candidate, but Serve's identity signals found one credible existing resident: ${match.descriptions.join(" ")}`,
    };
  }

  if (inCommunity.length > 1) {
    return {
      ...base,
      classification: "ambiguous",
      residentId: null,
      residentName: null,
      matchMethod: null,
      matchConfidence: null,
      ambiguousCandidateIds: inCommunity.map((c) => c.residentId),
      reason: `No roster-specific candidate, and Serve's identity signals found ${inCommunity.length} possible existing residents — cannot auto-resolve: ${inCommunity.map((c) => c.residentName).join(", ")}.`,
    };
  }

  // Nothing in-community either — check for a cross-community candidate
  // (identity refinement 1: a legitimate move/lease-overlap case, not an
  // error). findCanonicalCandidates already excludes any candidate with
  // contradicting evidence (assignConfidenceBand returns
  // 'needs_investigation', below the "high"/"probable" bar it filters
  // on) — a contradicted cross-community candidate is treated the same
  // as no candidate at all, never surfaced as a suggestion.
  const crossCommunity = findCanonicalCandidates(outcome.person, crossCommunityCandidates, null, confirmedAliases);

  if (crossCommunity.length === 1) {
    const lead = crossCommunity[0];
    return {
      ...base,
      classification: "possible_cross_community_match",
      residentId: lead.residentId,
      residentName: lead.residentName,
      matchMethod: null,
      matchConfidence: lead.band === "high" ? "medium" : "low",
      isCrossCommunitySuggestion: true,
      reason: `No candidate in this community, but Serve's identity signals found a possible match living in another community — a possible move or lease-overlap, not an error: ${lead.descriptions.join(" ")} Confirming this never moves the resident's community or erases their prior community history.`,
    };
  }

  if (crossCommunity.length > 1) {
    return {
      ...base,
      crossCommunityNote: `${crossCommunity.length} possible existing people in other communities — not enough evidence to lead with one; search directly if this looks like a known person.`,
    };
  }

  return base;
}

export function reconcileCommunityRosterOutcomes(
  outcomes: readonly PersonOutcome[],
  input: Omit<ReconcileCommunityRosterOutcomeInput, "outcome">
): RosterReconciliationOutcome[] {
  return outcomes.map((outcome) => reconcileCommunityRosterOutcome({ outcome, ...input }));
}
