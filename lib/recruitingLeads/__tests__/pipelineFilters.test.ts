import assert from "node:assert/strict";
import {
  countRecruitingLeadsByFilter,
  filterRecruitingLeadsForPipeline,
  PIPELINE_FILTER_TABS,
} from "../pipelineFilters.ts";
import type { RecruitingLead, RecruitingLeadStatus } from "@/lib/supabase/types";
import type { EnrichedRecruitingLead } from "@/lib/data/recruitingLeads";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function lead(overrides: Partial<RecruitingLead>): RecruitingLead {
  return {
    id: `lead-${Math.random()}`,
    created_at: "2026-07-01T00:00:00Z",
    role_interest: "caregiver",
    source: "test",
    status: "new",
    first_name: "Test",
    last_name: "Person",
    phone: null,
    email: null,
    zip_code: null,
    city_state: null,
    availability: null,
    experience_level: null,
    certification_license: null,
    linkedin_url: null,
    resume_url: null,
    resume_filename: null,
    resume_uploaded_at: null,
    exploration_timeline: null,
    message: null,
    raw_submission: null,
    form_started_at: null,
    form_completed_at: null,
    apploi_redirected_at: null,
    ...overrides,
  } as RecruitingLead;
}

// effectiveStatus defaults to the underlying lead's stored status
// (i.e. no workforce-link override) unless explicitly overridden —
// most tests in this file don't care about the derivation, only about
// filter/count behavior over whatever effectiveStatus already is.
function entry(overrides: Partial<RecruitingLead> & { effectiveStatus?: RecruitingLeadStatus }): EnrichedRecruitingLead {
  const { effectiveStatus, ...leadOverrides } = overrides;
  const l = lead(leadOverrides);
  return {
    lead: l,
    effectiveStatus: effectiveStatus ?? l.status,
    isDerivedFromWorkforceLink: false,
    linkedWorkforceMemberId: null,
  };
}

const sample = [
  entry({ id: "a", status: "new" }),
  entry({ id: "b", status: "in_review" }),
  entry({ id: "c", status: "archived" }),
  entry({ id: "d", status: "archived" }),
  entry({ id: "e", status: "hired" }),
  entry({ id: "f", status: "not_a_fit" }),
];

test("'all' (Active Pipeline) excludes every terminal status: archived, hired, not_a_fit", () => {
  const result = filterRecruitingLeadsForPipeline(sample, "all");
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => ["new", "in_review"].includes(e.effectiveStatus)));
});

test("an explicit status filter, including every terminal one, returns exactly that status", () => {
  const archived = filterRecruitingLeadsForPipeline(sample, "archived");
  assert.equal(archived.length, 2);
  assert.ok(archived.every((e) => e.effectiveStatus === "archived"));

  const hired = filterRecruitingLeadsForPipeline(sample, "hired");
  assert.equal(hired.length, 1);
  assert.equal(hired[0].lead.id, "e");

  const notAFit = filterRecruitingLeadsForPipeline(sample, "not_a_fit");
  assert.equal(notAFit.length, 1);
  assert.equal(notAFit[0].lead.id, "f");
});

test("an empty list produces an empty result for every filter", () => {
  assert.deepEqual(filterRecruitingLeadsForPipeline([], "all"), []);
  assert.deepEqual(filterRecruitingLeadsForPipeline([], "archived"), []);
});

test("'all' (Active Pipeline) count excludes every terminal status", () => {
  const counts = countRecruitingLeadsByFilter(sample);
  assert.equal(counts.all, 2);
});

test("per-status counts include every terminal status in its own bucket", () => {
  const counts = countRecruitingLeadsByFilter(sample);
  assert.equal(counts.archived, 2);
  assert.equal(counts.new, 1);
  assert.equal(counts.in_review, 1);
  assert.equal(counts.hired, 1);
  assert.equal(counts.not_a_fit, 1);
});

test("counts and filtered results stay consistent with each other", () => {
  const counts = countRecruitingLeadsByFilter(sample);
  const visible = filterRecruitingLeadsForPipeline(sample, "all");
  assert.equal(counts.all, visible.length);
});

// ─── REGRESSION (Alma Owolabi general case): effectiveStatus, not raw
// stored status, drives pipeline filtering ─────────────────────────────

test("REGRESSION: a stored in_review lead whose effectiveStatus is derived hired (confirmed active workforce link) no longer appears in Active Pipeline", () => {
  const almaLikeSample = [
    entry({ id: "alma", status: "in_review", effectiveStatus: "hired" }),
    entry({ id: "other", status: "in_review" }),
  ];
  const activePipeline = filterRecruitingLeadsForPipeline(almaLikeSample, "all");
  assert.equal(activePipeline.length, 1);
  assert.equal(activePipeline[0].lead.id, "other");

  const hiredTab = filterRecruitingLeadsForPipeline(almaLikeSample, "hired");
  assert.equal(hiredTab.length, 1);
  assert.equal(hiredTab[0].lead.id, "alma");
});

test("REGRESSION: an unresolved candidate (no workforce link) remains visible in Active Pipeline", () => {
  const unresolvedSample = [entry({ id: "unresolved", status: "in_review" })];
  const activePipeline = filterRecruitingLeadsForPipeline(unresolvedSample, "all");
  assert.equal(activePipeline.length, 1);
  assert.equal(activePipeline[0].lead.id, "unresolved");
});

test("REGRESSION: an archived/closed candidate does not reappear in Active Pipeline counts", () => {
  const archivedSample = [entry({ id: "closed", status: "archived" })];
  const counts = countRecruitingLeadsByFilter(archivedSample);
  assert.equal(counts.all ?? 0, 0);
  assert.equal(counts.archived, 1);
});

// ─── "Hired is a terminal transition, not a pipeline population": Hired
// has no tab on the normal Recruiting work surface, but the underlying
// status/filter capability is untouched ──────────────────────────────

test("PIPELINE_FILTER_TABS (the exposed Recruiting UI tabs) excludes 'hired'", () => {
  assert.ok(!PIPELINE_FILTER_TABS.includes("hired"), "'hired' must not be an exposed pipeline tab");
});

test("PIPELINE_FILTER_TABS still exposes every other terminal status as its own tab", () => {
  assert.ok(PIPELINE_FILTER_TABS.includes("archived"));
  assert.ok(PIPELINE_FILTER_TABS.includes("not_a_fit"));
  assert.ok(PIPELINE_FILTER_TABS.includes("all"));
});

test("'hired' remains a fully valid, directly filterable stored/effective status even with no UI tab (e.g. lead detail page, admin lookup)", () => {
  const hired = filterRecruitingLeadsForPipeline(sample, "hired");
  assert.equal(hired.length, 1);
  assert.equal(hired[0].lead.id, "e");
});

test("REGRESSION (Alma Owolabi, terminal-transition case): once effectiveStatus is hired, the record is absent from Active Pipeline and every exposed tab's default rendering, but its stored status is untouched (never rewritten to archived)", () => {
  const almaHired = entry({ id: "alma", status: "hired", effectiveStatus: "hired" });
  const activePipeline = filterRecruitingLeadsForPipeline([almaHired], "all");
  assert.equal(activePipeline.length, 0);
  assert.equal(almaHired.lead.status, "hired");
  for (const tab of PIPELINE_FILTER_TABS) {
    const visible = filterRecruitingLeadsForPipeline([almaHired], tab);
    assert.equal(visible.length, 0, `Alma (hired) must not appear under exposed tab "${tab}"`);
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
