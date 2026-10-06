import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  decideAxisCarePreviewSource,
  approvedFactsForCurrentAssessment,
  describeSendLifecycleState,
  APPROVED_SESSION_STATUSES,
  type SessionRef,
} from "../axiscarePreviewSource.ts";
import {
  classifyApprovedFactsForAxisCare,
  notSentReasonForField,
  AXISCARE_CREATE_DESTINATIONS,
  type ClassifiableApprovedFact,
} from "../axiscareFieldClassification.ts";
import { evaluateAxisCareClientCreate, AXISCARE_UPDATE_NOT_IMPLEMENTED, type AxisCareIdentityLinkState } from "../axiscareReadiness.ts";
import { buildApprovedFactsForReview, computeReviewExceptions, type DraftFactForReview } from "../reviewExceptions.ts";
import { FIELD_REGISTRY } from "../domainRegistry.ts";
import type { AssertionState } from "../factTypes.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const codeOf = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const fnBody = (src: string, name: string) => src.split(`export async function ${name}(`)[1]?.split("\nexport ")[0] ?? "";

const RESIDENT = "r-eleanor";
const A = "session-A";
const B = "session-B";
const approvedSession = (id: string, status = "approved"): SessionRef => ({ id, residentId: RESIDENT, status });
const ev = (sessionId: string | null, createdAt: string) => ({ sessionId, createdAt });

// ─── 3. current-assessment authority ─────────────────────────────────────────────────────────

test("authority: exactly one current approved assessment, requested = current → ok", () => {
  const d = decideAxisCarePreviewSource({
    requested: approvedSession(B),
    canonicalLatest: ev(B, "2026-10-05T12:00:00Z"),
    activeEvidence: [ev(B, "2026-10-05T12:00:00Z")],
    currentSession: approvedSession(B),
  });
  assert.deepEqual(d, { kind: "ok", currentSessionId: B });
});

test("authority: an unapproved requested session is refused server-side (draft / needs_review / captured …)", () => {
  for (const status of ["recording", "captured", "queued", "processing", "failed", "draft", "needs_review"]) {
    const d = decideAxisCarePreviewSource({
      requested: { id: B, residentId: RESIDENT, status },
      canonicalLatest: ev(B, "t"),
      activeEvidence: [ev(B, "t")],
      currentSession: approvedSession(B),
    });
    assert.equal(d.kind === "blocked" && d.reason, "requested_not_approved", status);
  }
});

test("authority: approved but NOT current → refused, and the current session is identified", () => {
  const d = decideAxisCarePreviewSource({
    requested: approvedSession(A),
    canonicalLatest: ev(B, "2026-10-05T12:00:00Z"),
    activeEvidence: [ev(B, "2026-10-05T12:00:00Z")],
    currentSession: approvedSession(B),
  });
  assert.equal(d.kind, "blocked");
  if (d.kind === "blocked") {
    assert.equal(d.reason, "requested_not_current");
    assert.equal(d.currentSessionId, B);
  }
});

test("authority: no current approved assessment → clear blocker", () => {
  const d = decideAxisCarePreviewSource({ requested: approvedSession(A), canonicalLatest: null, activeEvidence: [], currentSession: null });
  assert.equal(d.kind === "blocked" && d.reason, "no_current_assessment");
  const noRef = decideAxisCarePreviewSource({ requested: approvedSession(A), canonicalLatest: ev(null, "t"), activeEvidence: [ev(null, "t")], currentSession: null });
  assert.equal(noRef.kind === "blocked" && noRef.reason, "no_current_assessment");
});

test("authority: ambiguous current (two non-superseded evidence rows naming different sessions) → blocker, never a silent pick", () => {
  const d = decideAxisCarePreviewSource({
    requested: approvedSession(B),
    canonicalLatest: ev(B, "2026-10-05T12:00:00Z"),
    activeEvidence: [ev(A, "2026-10-01T12:00:00Z"), ev(B, "2026-10-05T12:00:00Z")],
    currentSession: approvedSession(B),
  });
  assert.equal(d.kind === "blocked" && d.reason, "ambiguous_current_assessment");
});

test("authority: the canonical record pointing at a non-approved / other-person session is refused as inconsistent", () => {
  for (const currentSession of [{ id: B, residentId: RESIDENT, status: "draft" }, { id: B, residentId: "someone-else", status: "approved" }, null]) {
    const d = decideAxisCarePreviewSource({ requested: approvedSession(B), canonicalLatest: ev(B, "t"), activeEvidence: [ev(B, "t")], currentSession });
    assert.equal(d.kind === "blocked" && d.reason, "current_assessment_inconsistent", JSON.stringify(currentSession));
  }
  assert.deepEqual([...APPROVED_SESSION_STATUSES], ["approved", "amended", "operationalized"]);
});

// ─── 11. reassessment regression ─────────────────────────────────────────────────────────────

const row = (session: string, fieldPath: string, value: unknown, approvedAt: string, assertion_state = "confirmed_yes") => ({
  id: `${session}-${fieldPath}`,
  originating_assessment_session_id: session,
  field_path: fieldPath,
  value,
  assertion_state,
  approved_at: approvedAt,
});
const residentWideRows = [
  row(A, "identity.preferred_name", "Eleanor", "2026-10-01T12:00:00Z"),
  row(A, "daily_life.laundry", true, "2026-10-01T12:00:00Z"),
  row(B, "identity.preferred_name", "Ellie", "2026-10-05T12:00:00Z"),
];
const toFacts = (rows: { field_path: string; assertion_state: string; value: unknown }[]) =>
  rows.map((r) => ({ fieldPath: r.field_path, assertionState: r.assertion_state as AssertionState, value: r.value }));
const resident = { firstName: "Eleanor", lastName: "MobileTest" };
const noLink: AxisCareIdentityLinkState = { status: null, axiscareClientId: null, matchConfidence: null };
const evaluate = (facts: ReturnType<typeof toFacts>, identityLink = noLink) =>
  evaluateAxisCareClientCreate({ residentId: RESIDENT, resident, approvedFacts: facts, canonicalProfileFacts: null, identityLink, assessmentDate: "2026-10-05T12:00:00Z" });

test("REASSESSMENT: Assessment B (Ellie) is current → the preview uses Ellie, never Eleanor from earlier Assessment A", () => {
  const current = approvedFactsForCurrentAssessment(residentWideRows, B);
  const result = evaluate(toFacts(current));
  assert.equal(result.payload?.goesBy, "Ellie");
});

test("REASSESSMENT: historical approved facts never leak in as fallback (A's laundry fact is absent from B's projection)", () => {
  const current = approvedFactsForCurrentAssessment(residentWideRows, B);
  assert.deepEqual(current.map((r) => r.id), ["session-B-identity.preferred_name"]);
  const c = classifyApprovedFactsForAxisCare({ facts: toFacts(current), payload: evaluate(toFacts(current)).payload });
  assert.ok(![...c.sent, ...c.notSent].some((f) => f.fieldPath === "daily_life.laundry"));
});

test("REASSESSMENT (documents the bug being fixed): the old resident-wide, oldest-first merge would have sent Eleanor", () => {
  const result = evaluate(toFacts(residentWideRows)); // what getApprovedFactsForResident fed the mapper before
  assert.equal(result.payload?.goesBy, "Eleanor");
});

test("STATIC: generateAxisCarePreview decides the source first, then reads ONLY getApprovedFactsForSession(currentSessionId) — never resident-wide facts", () => {
  const body = fnBody(codeOf("lib/actions/assessmentIntelligence.ts"), "generateAxisCarePreview");
  assert.ok(body.length > 0);
  assert.ok(!body.includes("getApprovedFactsForResident"), "resident-wide historical facts must not be the AxisCare authority");
  assert.match(body, /approvedFactsForCurrentAssessment\(await getApprovedFactsForSession\(currentSessionId\), currentSessionId\)/);
  const iDecide = body.indexOf("decideAxisCarePreviewSource(");
  const iBlockedReturn = body.indexOf('if (sourceDecision.kind === "blocked")');
  const iFacts = body.indexOf("getApprovedFactsForSession(");
  const iWrite = body.indexOf("writeAssessmentDecision(");
  assert.ok(iDecide > 0 && iDecide < iBlockedReturn && iBlockedReturn < iFacts && iFacts < iWrite, "source refusal precedes any fact read and any audit write");
});

// ─── 5. Sent / Not Sent classification ───────────────────────────────────────────────────────

test("classification: every registry field resolves to exactly one outcome (no unclassified field can exist)", () => {
  for (const def of FIELD_REGISTRY) {
    const create = AXISCARE_CREATE_DESTINATIONS[def.fieldPath];
    const reason = notSentReasonForField(def.fieldPath);
    assert.ok(create || reason, def.fieldPath);
  }
  const allFacts: ClassifiableApprovedFact[] = FIELD_REGISTRY.map((d) => ({ fieldPath: d.fieldPath, assertionState: "confirmed_yes", value: "x" }));
  const c = classifyApprovedFactsForAxisCare({ facts: allFacts, payload: evaluate([]).payload });
  assert.equal(c.sent.length + c.notSent.length + c.mappableWithoutPayload.length, FIELD_REGISTRY.length);
  const seen = new Set([...c.sent, ...c.notSent].map((f) => f.fieldPath));
  assert.equal(seen.size, FIELD_REGISTRY.length, "each fact appears exactly once");
});

test("classification is deterministic (input order doesn't matter)", () => {
  const facts = toFacts(ELEANOR);
  const p = evaluate(facts).payload;
  assert.deepEqual(classifyApprovedFactsForAxisCare({ facts, payload: p }), classifyApprovedFactsForAxisCare({ facts: [...facts].reverse(), payload: p }));
});

test("Leave Unknown / Needs follow-up never enter the projection (not Sent, not Not Sent)", () => {
  const draft = (id: string, fieldPath: string, assertionState: AssertionState, value: unknown): DraftFactForReview => ({
    id, fieldPath, value, assertionState, collectionMethod: "reported", reporter: "daughter", evidence: "…", confidence: "medium",
  });
  const drafts = [
    draft("1", "daily_life.bathing", "confirmed_yes", true),
    draft("2", "health.allergies", "uncertain", "maybe penicillin"),
    draft("3", "vision_hearing.hearing_difficulty", "uncertain", "unclear"),
  ];
  const { exceptions, clearFacts } = computeReviewExceptions(drafts, []);
  const approved = buildApprovedFactsForReview(clearFacts, exceptions, {
    "health.allergies": "leave_uncertain", // Leave Unknown
    "vision_hearing.hearing_difficulty": "leave_uncertain", // Needs follow-up shares this string
  });
  const facts = approved.map((a) => ({ fieldPath: a.field_path, assertionState: a.assertion_state, value: a.value }));
  const c = classifyApprovedFactsForAxisCare({ facts, payload: evaluate([]).payload });
  const paths = [...c.sent, ...c.notSent, ...c.mappableWithoutPayload].map((f) => f.fieldPath);
  assert.ok(!paths.includes("health.allergies"));
  assert.ok(!paths.includes("vision_hearing.hearing_difficulty"));
  assert.ok(paths.includes("daily_life.bathing"));
});

test("defensive: uncertain/conflicting rows are filtered out even if a reader returned them", () => {
  const rows = [row(B, "health.allergies", "?", "t", "uncertain"), row(B, "health.diagnoses", "?", "t", "conflicting"), row(B, "daily_life.laundry", true, "t")];
  assert.deepEqual(approvedFactsForCurrentAssessment(rows, B).map((r) => r.field_path), ["daily_life.laundry"]);
});

test("an address that AxisCare can't accept (no city/state/ZIP) is reported Not Sent as incomplete, not silently dropped", () => {
  const facts = toFacts([row(B, "residence.address_line1", "12 Elm St", "t")]);
  const c = classifyApprovedFactsForAxisCare({ facts, payload: evaluate(facts).payload });
  assert.equal(c.notSent[0]?.reason, "incomplete_for_axiscare");
});

// ─── 6. Eleanor acceptance fixture (generic behavior) ────────────────────────────────────────

const ELEANOR = [
  ["identity.preferred_name", "Eleanor"],
  ["identity.date_of_birth", "1942-03-14"],
  ["identity.phone", "214-555-0100"],
  ["important_people.primary_contact_name", "Susan"],
  ["important_people.primary_contact_relationship", "daughter"],
  ["important_people.decision_maker", "Susan"],
  ["important_people.physician_name", "Dr. Anita Patel"],
  ["what_why.primary_goals", "Stay independent at home"],
  ["daily_life.bathing", true],
  ["daily_life.dressing", true],
  ["daily_life.medication_reminders", true],
  ["daily_life.medication_timing", "morning and evening"],
  ["daily_life.medication_setup", true],
  ["daily_life.meals_nutrition", true],
  ["daily_life.meal_preparation", true],
  ["daily_life.laundry", true],
  ["mobility_safety.walker", true],
  ["mobility_safety.shower_equipment", true],
  ["mobility_safety.recent_falls", true],
  ["vision_hearing.hearing_aids", true],
  ["health.diagnoses", "hypertension"],
  ["health.allergies", "penicillin"],
  ["health.dietary_restrictions", "low sodium"],
  ["advance_planning.medical_poa", true],
  ["when.desired_start_timing", "next week"],
  ["when.preferred_days", "Mon/Wed/Fri"],
  ["when.preferred_time_windows", "mornings"],
  ["when.frequency", "3 times weekly"],
  ["serve_relationship_intelligence.primary_motivation", "daughter's peace of mind"],
].map(([p, v]) => row(B, p as string, v, "2026-10-05T12:00:00Z"));

test("ELEANOR: CREATE preview sends identity/demographics, Inactive, external id, assessment date — and nothing richer", () => {
  const result = evaluate(toFacts(ELEANOR));
  assert.equal(result.proposedAction, "create");
  assert.ok(result.payload);
  const p = result.payload!;
  assert.equal(p.goesBy, "Eleanor");
  assert.equal(p.dateOfBirth, "1942-03-14");
  assert.equal(p.homePhone, "214-555-0100");
  assert.equal(p.externalId, RESIDENT);
  assert.deepEqual(p.status, { active: false, label: "Inactive" });
  assert.equal(p.assessmentDate, "2026-10-05T12:00:00Z");
  assert.deepEqual(Object.keys(p).sort(), ["assessmentDate", "dateOfBirth", "externalId", "firstName", "goesBy", "homePhone", "lastName", "status"].sort());
});

test("ELEANOR: Sent / Not Sent with deterministic reasons", () => {
  const facts = toFacts(ELEANOR);
  const c = classifyApprovedFactsForAxisCare({ facts, payload: evaluate(facts).payload });
  const sent = Object.fromEntries(c.sent.map((s) => [s.fieldPath, s.destination]));
  assert.deepEqual(sent, { "identity.preferred_name": "goesBy", "identity.date_of_birth": "dateOfBirth", "identity.phone": "homePhone" });
  const reasonOf = Object.fromEntries(c.notSent.map((n) => [n.fieldPath, n.reason]));
  for (const p of ["important_people.primary_contact_name", "important_people.primary_contact_relationship", "important_people.decision_maker", "important_people.physician_name"]) assert.equal(reasonOf[p], "contact", p);
  for (const p of ["daily_life.bathing", "daily_life.dressing", "daily_life.medication_reminders", "daily_life.medication_timing", "daily_life.medication_setup", "daily_life.meals_nutrition", "daily_life.meal_preparation", "daily_life.laundry", "mobility_safety.walker", "mobility_safety.shower_equipment", "vision_hearing.hearing_aids"]) assert.equal(reasonOf[p], "care_plan", p);
  for (const p of ["what_why.primary_goals", "mobility_safety.recent_falls", "health.diagnoses", "health.allergies", "health.dietary_restrictions"]) assert.equal(reasonOf[p], "narrative", p);
  for (const p of ["advance_planning.medical_poa", "when.desired_start_timing", "when.preferred_days", "when.preferred_time_windows", "when.frequency"]) assert.equal(reasonOf[p], "unknown_axiscare_capability", p);
  assert.equal(reasonOf["serve_relationship_intelligence.primary_motivation"], "serve_only");
  assert.equal(c.sent.length + c.notSent.length, ELEANOR.length);
});

// ─── 7. CREATE vs UPDATE ─────────────────────────────────────────────────────────────────────

test("UPDATE: a confirmed AxisCare identity → update, existing id, blocked, NO payload fabricated; mappable facts listed separately", () => {
  const facts = toFacts(ELEANOR);
  const result = evaluate(facts, { status: "confirmed", axiscareClientId: "AC-77", matchConfidence: "high" });
  assert.equal(result.proposedAction, "update");
  assert.equal(result.existingAxisCareClientId, "AC-77");
  assert.equal(result.payload, null);
  assert.ok(result.processHardBlockers.includes(AXISCARE_UPDATE_NOT_IMPLEMENTED));
  const c = classifyApprovedFactsForAxisCare({ facts, payload: result.payload });
  assert.equal(c.sent.length, 0, "nothing is 'sent' without a payload");
  assert.deepEqual(c.mappableWithoutPayload.map((m) => m.destination), ["goesBy", "dateOfBirth", "homePhone"]);
});

test("STATIC: the preview UI states CREATE / UPDATE, the source assessment, Not Sent, and keeps JSON secondary", () => {
  const ui = codeOf("components/assessment/AssessmentReviewPanel.tsx");
  assert.match(ui, /"CREATE new AxisCare client"/);
  assert.match(ui, /UPDATE existing AxisCare client \$\{preview\.existingAxisCareClientId/);
  assert.match(ui, /Based on current assessment approved/);
  assert.match(ui, /Not sent to AxisCare/);
  assert.match(ui, /if \(preview\.sourceBlocker\)/);
  assert.match(ui, /Technical request JSON/);
});

// ─── 9. Service Agreement / relationship — informational only ────────────────────────────────

test("lifecycle: describes signed SA + inactive_client as unblocked, anything else as blocked-for-Send (information only)", () => {
  assert.equal(describeSendLifecycleState({ serviceAgreementStatus: "satisfied", relationship: "inactive_client" }).sendWouldBeLifecycleBlocked, false);
  const prospect = describeSendLifecycleState({ serviceAgreementStatus: "missing", relationship: "prospect" });
  assert.equal(prospect.sendWouldBeLifecycleBlocked, true);
  assert.equal(prospect.serviceAgreementSigned, false);
  assert.equal(prospect.reasons.length, 2);
  assert.equal(describeSendLifecycleState({ serviceAgreementStatus: null, relationship: null }).serviceAgreementStatus, "missing");
});

test("STATIC: lifecycle never gates the preview — evaluation and payload don't depend on it", () => {
  const readiness = codeOf("lib/assessmentIntelligence/axiscareReadiness.ts");
  assert.ok(!/lifecycle|serviceAgreement|inactive_client/i.test(readiness.split("export function evaluateAxisCareClientCreate")[1] ?? ""));
  const body = fnBody(codeOf("lib/actions/assessmentIntelligence.ts"), "generateAxisCarePreview");
  assert.ok(body.indexOf("evaluateAxisCareClientCreate(") < body.indexOf("describeSendLifecycleState("), "payload is built before lifecycle is even looked up");
});

// ─── 10. audit attribution ───────────────────────────────────────────────────────────────────

test("STATIC: preview audit rows are attributed to the current approved assessment actually used", () => {
  const body = fnBody(codeOf("lib/actions/assessmentIntelligence.ts"), "generateAxisCarePreview");
  assert.match(body, /writeAssessmentDecision\(\{\s*assessmentSessionId: currentSessionId,/);
  assert.match(body, /writeAssessmentOutput\(\{\s*assessmentSessionId: currentSessionId,/);
  assert.ok(!/writeAssessment(Decision|Output)\(\{\s*assessmentSessionId,/.test(body), "never the merely-requested session id");
  assert.match(body, /output: \{ evaluation, source, classification, lifecycle \}/);
});

// ─── no AxisCare mutation ────────────────────────────────────────────────────────────────────

test("STATIC: the AxisCare HTTP client stays GET-only and no mutation path exists anywhere in the integration", () => {
  const dir = join(repoRoot, "lib/integrations/axiscare");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, file), "utf8");
    assert.ok(!/method:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i.test(src), file);
    assert.ok(!/export (async )?function axisCare(Post|Put|Patch|Delete)/.test(src), file);
  }
  const client = codeOf("lib/integrations/axiscare/client.ts");
  assert.match(client, /method: "GET"/);
  for (const f of ["lib/actions/assessmentIntelligence.ts", "lib/assessmentIntelligence/axiscarePreviewSource.ts", "lib/assessmentIntelligence/axiscareFieldClassification.ts"]) {
    assert.ok(!/axisCareGet|fetch\(/.test(codeOf(f).split("export async function generateAxisCarePreview")[1]?.split("\nexport ")[0] ?? codeOf(f)), `${f} performs no AxisCare call`);
  }
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
