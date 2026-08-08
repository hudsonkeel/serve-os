import assert from "node:assert/strict";
import {
  countRecruitingLeadsByFilter,
  filterRecruitingLeadsForPipeline,
} from "../pipelineFilters.ts";
import type { RecruitingLead } from "@/lib/supabase/types";

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

const sample = [
  lead({ id: "a", status: "new" }),
  lead({ id: "b", status: "in_review" }),
  lead({ id: "c", status: "archived" }),
  lead({ id: "d", status: "archived" }),
  lead({ id: "e", status: "hired" }),
  lead({ id: "f", status: "not_a_fit" }),
];

test("'all' (Active Pipeline) excludes every terminal status: archived, hired, not_a_fit", () => {
  const result = filterRecruitingLeadsForPipeline(sample, "all");
  assert.equal(result.length, 2);
  assert.ok(result.every((l) => ["new", "in_review"].includes(l.status)));
});

test("an explicit status filter, including every terminal one, returns exactly that status", () => {
  const archived = filterRecruitingLeadsForPipeline(sample, "archived");
  assert.equal(archived.length, 2);
  assert.ok(archived.every((l) => l.status === "archived"));

  const hired = filterRecruitingLeadsForPipeline(sample, "hired");
  assert.equal(hired.length, 1);
  assert.equal(hired[0].id, "e");

  const notAFit = filterRecruitingLeadsForPipeline(sample, "not_a_fit");
  assert.equal(notAFit.length, 1);
  assert.equal(notAFit[0].id, "f");
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
