// Pure-function tests for ../urlFilters.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import {
  buildWorkspaceHref,
  countActionableWorkItems,
  DEFAULT_WORKSPACE_FILTERS,
  isActionableWorkItem,
  matchesSourceFilter,
  parseWorkspaceFilters,
  resolveWorkspaceViewDefault,
  resolveWorkspaceViewOptions,
} from "../urlFilters.ts";
import type { WorkItem } from "../workItem.ts";
import type { AuthRole } from "../../auth/constants.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: "x",
    sourceType: "wellness_follow_up",
    title: "T",
    status: "needs_attention",
    evidenceType: "explicit",
    sourceRoute: "/x",
    explanation: "E",
    ...overrides,
  };
}

// ─── parseWorkspaceFilters ───────────────────────────────────────────────

test("parseWorkspaceFilters: no params -> defaults (all/all)", () => {
  assert.deepEqual(parseWorkspaceFilters({}), DEFAULT_WORKSPACE_FILTERS);
});

test("parseWorkspaceFilters: view=mine is honored", () => {
  assert.equal(parseWorkspaceFilters({ view: "mine" }).view, "mine");
});

test("parseWorkspaceFilters: an invalid/unrecognized view value falls back to 'all', never crashes", () => {
  assert.equal(parseWorkspaceFilters({ view: "bogus" }).view, "all");
});

test("parseWorkspaceFilters: source is passed through as-is (sourceType values are validated by matchesSourceFilter, not here)", () => {
  assert.equal(parseWorkspaceFilters({ source: "wellness_follow_up" }).source, "wellness_follow_up");
});

test("parseWorkspaceFilters: view and source combine independently", () => {
  const filters = parseWorkspaceFilters({ view: "unassigned", source: "incident" });
  assert.deepEqual(filters, { view: "unassigned", source: "incident" });
});

// ─── Office Staff Workspace Simplification v0.1 — role-aware view
// resolution. Presentation only: never changes isUnassigned()/
// matchesCurrentUser() (ownership.ts, untouched by this slice) or which
// WorkItems exist in the array being filtered. ──────────────────────────

test("resolveWorkspaceViewDefault: office_staff defaults to 'mine' ('What should I do')", () => {
  assert.equal(resolveWorkspaceViewDefault("office_staff" as AuthRole), "mine");
});

test("resolveWorkspaceViewDefault: every other role keeps the original 'all' default, unchanged", () => {
  for (const role of ["admin", "manager", "executive", "operations"] as AuthRole[]) {
    assert.equal(resolveWorkspaceViewDefault(role), "all", role);
  }
  assert.equal(resolveWorkspaceViewDefault(null), "all");
  assert.equal(resolveWorkspaceViewDefault(undefined), "all");
});

test("resolveWorkspaceViewOptions: office_staff gets exactly My Work, Available Work, All -- in that order, Team Work absent", () => {
  const options = resolveWorkspaceViewOptions("office_staff" as AuthRole);
  assert.deepEqual(
    options.map((o) => o.value),
    ["mine", "unassigned", "all"],
  );
  assert.deepEqual(
    options.map((o) => o.label),
    ["My Work", "Available Work", "All"],
  );
  assert.ok(!options.some((o) => o.value === "team"), "office_staff must never receive a Team Work option");
});

test("resolveWorkspaceViewOptions: every other role gets the original four options, unchanged (values, labels, and order)", () => {
  for (const role of ["admin", "manager", "executive", "operations", null, undefined] as (AuthRole | null | undefined)[]) {
    const options = resolveWorkspaceViewOptions(role);
    assert.deepEqual(
      options,
      [
        { value: "all", label: "All" },
        { value: "mine", label: "My Work" },
        { value: "team", label: "Team Work" },
        { value: "unassigned", label: "Unassigned" },
      ],
      String(role),
    );
  }
});

test("REGRESSION: parseWorkspaceFilters with no view param defaults office_staff to 'mine', not 'all'", () => {
  assert.equal(parseWorkspaceFilters({}, "office_staff" as AuthRole).view, "mine");
});

test("parseWorkspaceFilters: office_staff explicitly requesting the hidden 'team' view falls back to her own default ('mine'), never silently activating a hidden filter", () => {
  assert.equal(parseWorkspaceFilters({ view: "team" }, "office_staff" as AuthRole).view, "mine");
});

test("parseWorkspaceFilters: office_staff CAN still explicitly select 'unassigned' (Available Work) and 'all' -- only 'team' is hidden", () => {
  assert.equal(parseWorkspaceFilters({ view: "unassigned" }, "office_staff" as AuthRole).view, "unassigned");
  assert.equal(parseWorkspaceFilters({ view: "all" }, "office_staff" as AuthRole).view, "all");
  assert.equal(parseWorkspaceFilters({ view: "mine" }, "office_staff" as AuthRole).view, "mine");
});

test("parseWorkspaceFilters: an invalid view value for office_staff falls back to her own default ('mine'), not the global 'all' default", () => {
  assert.equal(parseWorkspaceFilters({ view: "bogus" }, "office_staff" as AuthRole).view, "mine");
});

test("REGRESSION: parseWorkspaceFilters behavior for every other role is completely unchanged by passing their role explicitly", () => {
  for (const role of ["admin", "manager", "executive", "operations"] as AuthRole[]) {
    assert.equal(parseWorkspaceFilters({}, role).view, "all");
    assert.equal(parseWorkspaceFilters({ view: "team" }, role).view, "team", `${role} must still be able to select Team Work`);
    assert.equal(parseWorkspaceFilters({ view: "bogus" }, role).view, "all");
  }
});

test("REGRESSION: omitting the role parameter entirely reproduces the exact pre-existing (role-agnostic) behavior", () => {
  assert.deepEqual(parseWorkspaceFilters({}), DEFAULT_WORKSPACE_FILTERS);
  assert.equal(parseWorkspaceFilters({ view: "team" }).view, "team");
  assert.equal(parseWorkspaceFilters({ view: "bogus" }).view, "all");
});

// ─── buildWorkspaceHref (Acceptance H — round-trips with parseWorkspaceFilters) ──

test("buildWorkspaceHref: default filters produce the plain /workspace root, no query string", () => {
  assert.equal(buildWorkspaceHref({}), "/workspace");
  assert.equal(buildWorkspaceHref(DEFAULT_WORKSPACE_FILTERS), "/workspace");
});

test("buildWorkspaceHref: a summary-card deep link for one source", () => {
  assert.equal(buildWorkspaceHref({ source: "wellness_follow_up" }), "/workspace?source=wellness_follow_up");
});

test("buildWorkspaceHref: view + source combine in one href", () => {
  const href = buildWorkspaceHref({ view: "mine", source: "relationship_action" });
  assert.equal(href, "/workspace?view=mine&source=relationship_action");
});

test("round-trip: buildWorkspaceHref -> parseWorkspaceFilters recovers the exact same filters (refresh/back-forward safety)", () => {
  const original = { view: "team" as const, source: "governance" as const };
  const href = buildWorkspaceHref(original);
  const query = href.split("?")[1] ?? "";
  const parsed = parseWorkspaceFilters(Object.fromEntries(new URLSearchParams(query)));
  assert.deepEqual(parsed, original);
});

// ─── matchesSourceFilter / GOVERNANCE grouping ──────────────────────────

test("matchesSourceFilter: 'all' matches every sourceType", () => {
  assert.ok(matchesSourceFilter(item({ sourceType: "recruiting" }), "all"));
  assert.ok(matchesSourceFilter(item({ sourceType: "corrective_action" }), "all"));
});

test("matchesSourceFilter: an exact sourceType matches only itself", () => {
  assert.ok(matchesSourceFilter(item({ sourceType: "assessment" }), "assessment"));
  assert.ok(!matchesSourceFilter(item({ sourceType: "proposal" }), "assessment"));
});

test("matchesSourceFilter: 'governance' matches incident/infection/compliance_requirement/corrective_action/effectiveness_review/infection_follow_up, nothing else", () => {
  for (const sourceType of [
    "incident",
    "infection",
    "compliance_requirement",
    "corrective_action",
    "effectiveness_review",
    "infection_follow_up",
  ] as const) {
    assert.ok(matchesSourceFilter(item({ sourceType }), "governance"), `${sourceType} should match governance`);
  }
  for (const sourceType of ["wellness_follow_up", "relationship_action", "assessment", "proposal", "recruiting", "other"] as const) {
    assert.ok(!matchesSourceFilter(item({ sourceType }), "governance"), `${sourceType} should NOT match governance`);
  }
});

// ─── isActionableWorkItem / countActionableWorkItems (Acceptance B/I) ───

test("isActionableWorkItem: every status except 'completed' counts as actionable", () => {
  for (const status of ["needs_attention", "in_progress", "due_today", "upcoming", "waiting"] as const) {
    assert.ok(isActionableWorkItem(item({ status })), status);
  }
  assert.ok(!isActionableWorkItem(item({ status: "completed" })));
});

test("countActionableWorkItems: matches exactly the same predicate a real filtered TodaysWorkView list would apply (Acceptance B — count == filtered list length)", () => {
  const items: WorkItem[] = [
    item({ id: "1", sourceType: "wellness_follow_up", status: "needs_attention" }),
    item({ id: "2", sourceType: "wellness_follow_up", status: "due_today" }),
    item({ id: "3", sourceType: "wellness_follow_up", status: "completed" }),
    item({ id: "4", sourceType: "relationship_action", status: "needs_attention" }),
  ];
  assert.equal(countActionableWorkItems(items, "wellness_follow_up"), 2);
  assert.equal(
    countActionableWorkItems(items, "wellness_follow_up"),
    items.filter((i) => matchesSourceFilter(i, "wellness_follow_up") && isActionableWorkItem(i)).length,
  );
});

test("countActionableWorkItems: a source with zero matching items counts zero (Acceptance I — never negative, never crashes)", () => {
  assert.equal(countActionableWorkItems([], "incident"), 0);
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
