// Synthetic assessment fixtures for the AxisCare end-to-end scope (Phase 2). All names, dates,
// addresses, and facts below are fabricated — no real resident/client data. These are pure data
// modules (no database writes) so they can be imported by unit tests, the mapping-layer dry-run
// tests, and eventually a properly test-marked live E2E script (see docs/engineering/
// TEST_DATA_HYGIENE.md — any future live-database run using these fixtures must still generate
// its own __SERVE_TEST__ marker; that is not this file's concern).

export interface SyntheticResidentProfile {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  community: string;
  apartmentUnit: string;
  addressLine1: string;
  phone: string;
  email: string;
}

export interface SyntheticApprovedFact {
  fieldPath: string;
  assertionState: "confirmed_yes" | "confirmed_no" | "uncertain" | "conflicting" | "not_applicable";
  value: unknown;
  evidence: string;
  reporter: string | null;
  collectionMethod: "observed" | "reported" | null;
  confidence: "low" | "medium" | "high";
}

// ============================================================================
// Fixture A — New Prospect
// ============================================================================
//
// Covers: identity/residence/contact fields, a full daily-life ADL sweep, mobility/fall-risk,
// medication reminders, and desired frequency/timing. `NOT_DISCUSSED_FIELD_PATHS` are the
// control fields — deliberately never mentioned in the transcript — a downstream test must
// assert none of them appear as an accepted fact at all (never inferred, never false).

export const FIXTURE_A_PROFILE: SyntheticResidentProfile = {
  firstName: "Eleanor",
  lastName: "Voss",
  dateOfBirth: "1938-04-12",
  community: "Watermere at Meadowbrook",
  apartmentUnit: "214",
  addressLine1: "4400 Meadowbrook Lane",
  phone: "555-330-1189",
  email: "evoss.family@example-mail.test",
};

export const FIXTURE_A_ASSESSMENT_DATE = "2026-08-10";

export const FIXTURE_A_TRANSCRIPT = `Assessor: Thanks for making time today. Let's start with the basics — can you confirm your mom's full name and date of birth?
Daughter (Karen Voss): Eleanor Voss, born April 12th, 1938.
Assessor: And she's in apartment 214 at Watermere at Meadowbrook, is that right?
Karen: Yes, 214, that's correct. The address is 4400 Meadowbrook Lane if you need it.
Assessor: What's the best phone and email to reach you as her primary contact?
Karen: My cell is 555-330-1189, and email is evoss.family@example-mail.test. I'm her daughter, and I'm the one who handles all of this for her.
Assessor: Let's talk about her daily routine. How's she doing with medications?
Karen: She takes four different pills morning and night, and honestly she forgets constantly. We really need someone reminding her twice a day.
Assessor: Any concerns about falling or her balance?
Karen: Yes — she fell in her kitchen about six weeks ago, just lost her balance reaching for something in a cabinet. Nothing broken, but it shook her up. She's been unsteady since.
Assessor: Does she need any help bathing?
Karen: Yes, she needs someone in the bathroom with her now, she's not safe getting in and out of the shower alone.
Assessor: What about grooming — hair, makeup, that kind of thing?
Karen: She can mostly do that herself still, actually. She likes to do her own hair.
Assessor: Dressing?
Karen: She needs a little help with buttons and zippers, her hands aren't what they used to be, but she can pick out and mostly put on her own clothes.
Assessor: Toileting?
Karen: No issues there, she's fully independent.
Assessor: How about housekeeping and laundry?
Karen: She can't really keep up with either anymore. The apartment's gotten pretty cluttered and she hasn't done laundry herself in months — my brother's been taking it home for her.
Assessor: And meals — is she eating well, and can she prepare food herself?
Karen: She eats fine when food is put in front of her, but she's basically stopped cooking. Frozen meals mostly, or whatever we bring by.
Assessor: Last thing — how often were you hoping to start service, and any preferred days or times?
Karen: We'd like to start as soon as possible, ideally daily visits, mornings work best since that's when the medication reminder matters most.`;

// Deliberately never mentioned anywhere in the transcript above — a downstream test must assert
// these produce zero accepted/rejected facts (absence, not a negative assertion).
export const FIXTURE_A_NOT_DISCUSSED_FIELD_PATHS = [
  "cognition.short_term_memory_change",
  "advance_planning.dnr",
  "daily_life.transportation_errands",
] as const;

export const FIXTURE_A_EXPECTED_FACTS: Array<{ fieldPath: string; assertionState: string; note: string }> = [
  { fieldPath: "identity.preferred_name", assertionState: "confirmed_yes", note: "Eleanor Voss" },
  { fieldPath: "identity.date_of_birth", assertionState: "confirmed_yes", note: "1938-04-12" },
  { fieldPath: "residence.apartment_unit", assertionState: "confirmed_yes", note: "214" },
  { fieldPath: "important_people.primary_contact_name", assertionState: "confirmed_yes", note: "Karen Voss" },
  { fieldPath: "important_people.primary_contact_phone", assertionState: "confirmed_yes", note: "555-330-1189" },
  { fieldPath: "daily_life.medication_reminders", assertionState: "confirmed_yes", note: "forgets constantly, needs reminders" },
  { fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_yes", note: "fell in kitchen ~6 weeks ago" },
  { fieldPath: "daily_life.bathing", assertionState: "confirmed_yes", note: "needs someone in bathroom" },
  { fieldPath: "daily_life.grooming", assertionState: "confirmed_no", note: "can mostly do that herself" },
  { fieldPath: "daily_life.dressing", assertionState: "confirmed_yes", note: "needs help with buttons/zippers" },
  { fieldPath: "daily_life.toileting", assertionState: "confirmed_no", note: "fully independent" },
  { fieldPath: "daily_life.housekeeping", assertionState: "confirmed_yes", note: "can't keep up, apartment cluttered" },
  { fieldPath: "daily_life.laundry", assertionState: "confirmed_yes", note: "brother taking it home for months" },
  { fieldPath: "daily_life.meal_preparation", assertionState: "confirmed_yes", note: "basically stopped cooking" },
  { fieldPath: "daily_life.meals_nutrition", assertionState: "confirmed_no", note: "eats fine when food is put in front of her" },
  { fieldPath: "when.desired_start_timing", assertionState: "confirmed_yes", note: "as soon as possible" },
  { fieldPath: "when.frequency", assertionState: "confirmed_yes", note: "daily visits" },
  { fieldPath: "when.preferred_time_windows", assertionState: "confirmed_yes", note: "mornings" },
];

// ============================================================================
// Fixture B — Existing Client Reassessment
// ============================================================================
//
// FIXTURE_B_EXISTING_APPROVED_FACTS represents the current canonical (already-approved) state
// as of the prior assessment. FIXTURE_B_REASSESSMENT_TRANSCRIPT is a new conversation that must
// be compared against it. Coverage, matched 1:1 to the Phase 2 spec:
//   - 2 actual changes:      daily_life.medication_reminders (clean confirmed_no -> confirmed_yes
//                             flip), daily_life.toileting (clean confirmed_no -> confirmed_yes flip)
//   - 2 unchanged facts:     mobility_safety.walker, daily_life.companionship_social
//   - 1 deliberate KNOWN LIMITATION case (not counted toward "2 changes"):
//                             daily_life.bathing is reconfirmed confirmed_yes/true in both the
//                             baseline and the reassessment — same boolean — but the evidence
//                             text describes materially more assistance needed now (standby ->
//                             full physical assist). compareReassessment() correctly classifies
//                             this UNCHANGED at the field's actual grain (a plain boolean can't
//                             represent "degree of assistance"), which is a genuine, real gap in
//                             the current domain-model granularity, not a bug — see
//                             reassessmentComparison.test.ts and the Phase 11 writeup.
//   - 3 existing-not-discussed: important_people.primary_contact_name, mobility_safety.recent_falls,
//                             health.allergies (must survive untouched)
//   - 1 ambiguous/conflicting: mobility_safety.recent_falls is re-raised mid-reassessment with two
//                             reporters disagreeing (daughter says a near-fall happened, son says no
//                             falls at all) — this ALSO happens to be one of the "not discussed"
//                             fields above in the sense that it wasn't mentioned at the START, but
//                             gets raised later in the same conversation as a genuine conflict; kept
//                             as a single combined case deliberately, because that is a realistic
//                             shape for a real reassessment conversation, not a simplified one.
//   - 1 new fact:            cognition.short_term_memory_change (never assessed before)

export const FIXTURE_B_PROFILE: SyntheticResidentProfile = {
  firstName: "Walter",
  lastName: "Higby",
  dateOfBirth: "1941-11-02",
  community: "Cedar Run Senior Living",
  apartmentUnit: "108",
  addressLine1: "900 Cedar Run Drive",
  phone: "555-420-7734",
  email: "shigby@example-mail.test",
};

export const FIXTURE_B_INITIAL_ASSESSMENT_DATE = "2026-05-02";
export const FIXTURE_B_REASSESSMENT_DATE = "2026-08-10";

export const FIXTURE_B_EXISTING_APPROVED_FACTS: SyntheticApprovedFact[] = [
  {
    fieldPath: "daily_life.bathing",
    assertionState: "confirmed_yes",
    value: true,
    evidence: "Needs standby assistance getting in and out of the shower.",
    reporter: "daughter",
    collectionMethod: "reported",
    confidence: "high",
  },
  {
    fieldPath: "daily_life.medication_reminders",
    assertionState: "confirmed_no",
    value: false,
    evidence: "Manages his own medications independently, no reminders needed.",
    reporter: "daughter",
    collectionMethod: "reported",
    confidence: "high",
  },
  {
    fieldPath: "daily_life.toileting",
    assertionState: "confirmed_no",
    value: false,
    evidence: "Fully independent with toileting at initial assessment.",
    reporter: "daughter",
    collectionMethod: "reported",
    confidence: "high",
  },
  {
    fieldPath: "mobility_safety.walker",
    assertionState: "confirmed_yes",
    value: true,
    evidence: "Uses a walker at all times.",
    reporter: "son",
    collectionMethod: "reported",
    confidence: "high",
  },
  {
    fieldPath: "daily_life.companionship_social",
    assertionState: "confirmed_yes",
    value: true,
    evidence: "Enjoys company, likes someone to sit and chat during visits.",
    reporter: "daughter",
    collectionMethod: "reported",
    confidence: "medium",
  },
  {
    fieldPath: "important_people.primary_contact_name",
    assertionState: "confirmed_yes",
    value: "Susan Higby",
    evidence: "Susan Higby identified herself as primary contact.",
    reporter: "daughter",
    collectionMethod: "reported",
    confidence: "high",
  },
  {
    fieldPath: "mobility_safety.recent_falls",
    assertionState: "confirmed_no",
    value: false,
    evidence: "No falls reported at initial assessment.",
    reporter: "daughter",
    collectionMethod: "reported",
    confidence: "medium",
  },
  {
    fieldPath: "health.allergies",
    assertionState: "confirmed_yes",
    value: "Penicillin",
    evidence: "Family confirmed a known penicillin allergy.",
    reporter: "daughter",
    collectionMethod: "reported",
    confidence: "high",
  },
];

export const FIXTURE_B_REASSESSMENT_TRANSCRIPT = `Assessor: It's been a few months — let's go through how things have changed for your dad.
Daughter (Susan Higby): A lot, actually. His bathing situation has gotten worse. He used to just need someone standing by, but now he can't really stand on his own in the shower at all — we need someone actually assisting him physically, not just supervising.
Assessor: Okay, that's a meaningful change, thank you. What about his medications?
Susan: That's the other big one. He's missed doses twice in the last month that we know of. He really needs reminders now, morning and evening.
Assessor: Does he still use the walker?
Son (Michael Higby): Yeah, still uses it every time he gets up, hasn't changed.
Assessor: And how's he doing socially, still enjoying visits?
Susan: Oh, definitely, he lights up whenever someone's here to talk with him. That hasn't changed either.
Assessor: Have you noticed anything with his memory lately?
Susan: Actually yes, now that you mention it — he's been more forgetful. He'll ask me the same question three or four times in one visit.
Assessor: How's he doing with toileting these days?
Susan: That's changed too, actually — he's started needing help getting on and off the toilet safely. He was completely independent with that before.
Assessor: One more thing — has he had any falls?
Susan: He almost went down in the kitchen last week, caught himself on the counter, but it scared me.
Michael: Wait, really? He told me he hasn't fallen at all, he said he's been steady as ever.
Susan: He probably didn't want to worry you. I was there, it happened.`;

export interface ReassessmentExpectedClassification {
  fieldPath: string;
  classification: "UNCHANGED" | "NEW_FACT" | "CHANGED_FACT" | "CONFLICTING_FACT" | "NOT_DISCUSSED" | "REQUIRES_REVIEW";
  note: string;
}

export const FIXTURE_B_EXPECTED_CLASSIFICATION: ReassessmentExpectedClassification[] = [
  { fieldPath: "daily_life.bathing", classification: "UNCHANGED", note: "KNOWN LIMITATION case: same boolean (confirmed_yes) both times, but evidence describes materially more assistance needed now — a degree-of-severity change the current single-boolean field cannot represent. Correctly classified UNCHANGED at this field's actual grain; not counted toward the '2 changes' requirement." },
  { fieldPath: "daily_life.medication_reminders", classification: "CHANGED_FACT", note: "clean flip: confirmed_no -> confirmed_yes" },
  { fieldPath: "daily_life.toileting", classification: "CHANGED_FACT", note: "clean flip: confirmed_no -> confirmed_yes" },
  { fieldPath: "mobility_safety.walker", classification: "UNCHANGED", note: "reconfirmed identically by a different reporter (son)" },
  { fieldPath: "daily_life.companionship_social", classification: "UNCHANGED", note: "reconfirmed identically" },
  { fieldPath: "important_people.primary_contact_name", classification: "NOT_DISCUSSED", note: "never mentioned in reassessment — must remain Susan Higby, never cleared" },
  { fieldPath: "health.allergies", classification: "NOT_DISCUSSED", note: "never mentioned in reassessment — must remain Penicillin, never cleared" },
  { fieldPath: "cognition.short_term_memory_change", classification: "NEW_FACT", note: "never previously assessed; now confirmed_yes reported by daughter" },
  { fieldPath: "mobility_safety.recent_falls", classification: "CONFLICTING_FACT", note: "daughter reports a near-fall, son directly contradicts (\"he told me he hasn't fallen at all\") in the SAME reassessment session, over a field that was previously confirmed_no — existing confirmed_no value must NOT be silently overwritten by either side; requires human review" },
];
