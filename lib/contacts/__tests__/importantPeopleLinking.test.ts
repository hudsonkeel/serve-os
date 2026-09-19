import assert from "node:assert/strict";
import { evaluateContactLinkForProposal, type ExistingContactCandidate } from "../importantPeopleLinking.ts";
import type { ContactForMatching } from "../identityMatch.ts";
import { normalizeContactPhone } from "../normalization.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function proposal(overrides: Partial<ContactForMatching> = {}): ContactForMatching {
  return { firstName: "Susan", lastName: "Carter", normalizedEmail: null, normalizedPhone: null, ...overrides };
}

function candidate(overrides: Partial<ExistingContactCandidate> & { contactId: string }): ExistingContactCandidate {
  return { firstName: "Susan", lastName: "Carter", normalizedEmail: null, normalizedPhone: null, ...overrides };
}

// ─── C. No existing contact match -> create ────────────────────────────────────────────────────

test("C: no existing contacts at all -> action is create_new, with no candidates", () => {
  const decision = evaluateContactLinkForProposal(proposal(), []);
  assert.equal(decision.action, "create_new");
  assert.equal(decision.matchedContactId, null);
  assert.deepEqual(decision.candidates, []);
});

test("C: existing contacts exist but none match at all -> create_new", () => {
  const decision = evaluateContactLinkForProposal(proposal(), [
    candidate({ contactId: "unrelated-1", firstName: "Maria", lastName: "Lopez" }),
  ]);
  assert.equal(decision.action, "create_new");
});

// ─── D. Exact strong existing-contact match -> link ────────────────────────────────────────────

test("D: an existing contact with the same normalized phone and agreeing name -> link_existing to that exact contact, avoiding a duplicate", () => {
  const phone = normalizeContactPhone("214-555-0187");
  const decision = evaluateContactLinkForProposal(proposal({ normalizedPhone: phone }), [
    candidate({ contactId: "existing-susan", normalizedPhone: phone }),
  ]);
  assert.equal(decision.action, "link_existing");
  assert.equal(decision.matchedContactId, "existing-susan");
});

// ─── E. Name-only existing match -> never silently link ────────────────────────────────────────

test("E: an existing contact shares only the name, no strong identifier -> create_new, NEVER link_existing", () => {
  const decision = evaluateContactLinkForProposal(proposal(), [candidate({ contactId: "different-susan" })]);
  assert.equal(decision.action, "create_new");
  assert.equal(decision.matchedContactId, null);
  // Still surfaced as an advisory candidate for display, just never auto-linked.
  assert.ok(decision.candidates.some((c) => c.contactId === "different-susan" && c.tier === "name_only_no_merge"));
});

// ─── Ambiguous/conflicting -> requires_reconciliation ──────────────────────────────────────────

test("a shared strong identifier with a conflicting name -> requires_reconciliation, never linked or created silently", () => {
  const phone = normalizeContactPhone("214-555-0187");
  const decision = evaluateContactLinkForProposal(proposal({ normalizedPhone: phone }), [
    candidate({ contactId: "conflict-1", firstName: "Robert", lastName: "Carter", normalizedPhone: phone }),
  ]);
  assert.equal(decision.action, "requires_reconciliation");
  assert.equal(decision.matchedContactId, null);
});

test("a surname-only partial match -> requires_reconciliation", () => {
  const decision = evaluateContactLinkForProposal(proposal({ firstName: "Sue" }), [
    candidate({ contactId: "partial-1", firstName: "Susan", lastName: "Carter" }),
  ]);
  assert.equal(decision.action, "requires_reconciliation");
});

// ─── F. Suppressed / confirmed-not-same -> no repeated merge proposal ──────────────────────────

test("F: a suppressed contact is excluded entirely, even though it would otherwise be an exact strong match -- never re-proposed", () => {
  const phone = normalizeContactPhone("214-555-0187");
  const decision = evaluateContactLinkForProposal(
    proposal({ normalizedPhone: phone }),
    [candidate({ contactId: "suppressed-1", normalizedPhone: phone })],
    new Set(["suppressed-1"])
  );
  assert.equal(decision.action, "create_new");
  assert.equal(decision.candidates.length, 0);
});

test("F: suppression is specific -- a suppressed contact doesn't affect matching against a DIFFERENT, non-suppressed exact match", () => {
  const phone = normalizeContactPhone("214-555-0187");
  const decision = evaluateContactLinkForProposal(
    proposal({ normalizedPhone: phone }),
    [candidate({ contactId: "suppressed-1", normalizedPhone: phone }), candidate({ contactId: "real-match", normalizedPhone: phone })],
    new Set(["suppressed-1"])
  );
  assert.equal(decision.action, "link_existing");
  assert.equal(decision.matchedContactId, "real-match");
});

// ─── Never a numeric fuzzy score ────────────────────────────────────────────────────────────────

test("candidates always carry a named tier and human-readable evidence, never a score", () => {
  const decision = evaluateContactLinkForProposal(proposal(), [candidate({ contactId: "c1" })]);
  for (const c of decision.candidates) {
    assert.equal(typeof c.tier, "string");
    assert.ok(Array.isArray(c.evidence));
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
