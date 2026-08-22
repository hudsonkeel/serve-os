import assert from "node:assert/strict";
import {
  resolveDefaultCommunityScope,
  canSelectAllCommunities,
  resolveCurrentCommunityScope,
  isValidCommunitySelection,
  isCommunityAccessAuthorized,
  communityScopeToQueryFilter,
  ALL_COMMUNITIES_SELECTION,
} from "../communityScope.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("an assigned community always wins, regardless of role", () => {
  const result = resolveDefaultCommunityScope({ communityId: "c-1", role: "manager" });
  assert.deepEqual(result, { mode: "single_community", communityId: "c-1" });
});

test("admin with no assignment defaults to all communities", () => {
  const result = resolveDefaultCommunityScope({ communityId: null, role: "admin" });
  assert.deepEqual(result, { mode: "all_communities" });
});

test("non-admin roles with no assignment are 'unassigned' — a real gap, never silently 'all communities'", () => {
  assert.deepEqual(resolveDefaultCommunityScope({ communityId: null, role: "manager" }), { mode: "unassigned" });
  assert.deepEqual(resolveDefaultCommunityScope({ communityId: null, role: "executive" }), { mode: "unassigned" });
  assert.deepEqual(resolveDefaultCommunityScope({ communityId: null, role: "operations" }), { mode: "unassigned" });
});

test("canSelectAllCommunities is true only for admin today", () => {
  assert.equal(canSelectAllCommunities("admin"), true);
  assert.equal(canSelectAllCommunities("manager"), false);
  assert.equal(canSelectAllCommunities("executive"), false);
  assert.equal(canSelectAllCommunities("operations"), false);
});

// ─── resolveCurrentCommunityScope ──────────────────────────────────────────

const ACTIVE_IDS = new Set(["c-frisco", "c-firewheel", "c-mckinney"]);

test("no cookie falls back to the default/home scope", () => {
  const result = resolveCurrentCommunityScope({
    cookieCommunityId: null,
    homeCommunityId: "c-frisco",
    role: "manager",
    activeCommunityIds: ACTIVE_IDS,
  });
  assert.deepEqual(result, { mode: "single_community", communityId: "c-frisco" });
});

test("a valid, active cookie value wins over the home community", () => {
  const result = resolveCurrentCommunityScope({
    cookieCommunityId: "c-firewheel",
    homeCommunityId: "c-frisco",
    role: "manager",
    activeCommunityIds: ACTIVE_IDS,
  });
  assert.deepEqual(result, { mode: "single_community", communityId: "c-firewheel" });
});

test("the all-communities cookie value is honored only for a role that can select it", () => {
  const admin = resolveCurrentCommunityScope({
    cookieCommunityId: ALL_COMMUNITIES_SELECTION,
    homeCommunityId: null,
    role: "admin",
    activeCommunityIds: ACTIVE_IDS,
  });
  assert.deepEqual(admin, { mode: "all_communities" });

  const manager = resolveCurrentCommunityScope({
    cookieCommunityId: ALL_COMMUNITIES_SELECTION,
    homeCommunityId: "c-frisco",
    role: "manager",
    activeCommunityIds: ACTIVE_IDS,
  });
  assert.deepEqual(manager, { mode: "single_community", communityId: "c-frisco" });
});

test("a stale/inactive/tampered cookie value fails safe to the normal chain, never an invented scope", () => {
  const withHome = resolveCurrentCommunityScope({
    cookieCommunityId: "c-does-not-exist",
    homeCommunityId: "c-frisco",
    role: "manager",
    activeCommunityIds: ACTIVE_IDS,
  });
  assert.deepEqual(withHome, { mode: "single_community", communityId: "c-frisco" });

  const withoutHome = resolveCurrentCommunityScope({
    cookieCommunityId: "c-does-not-exist",
    homeCommunityId: null,
    role: "manager",
    activeCommunityIds: ACTIVE_IDS,
  });
  assert.deepEqual(withoutHome, { mode: "unassigned" });
});

test("a role downgrade never leaves a stale all-communities cookie silently honored, and never silently converts to unassigned as a special case -- it just falls through the normal chain", () => {
  const result = resolveCurrentCommunityScope({
    cookieCommunityId: ALL_COMMUNITIES_SELECTION,
    homeCommunityId: null,
    role: "operations",
    activeCommunityIds: ACTIVE_IDS,
  });
  assert.deepEqual(result, { mode: "unassigned" });
});

// ─── isValidCommunitySelection ─────────────────────────────────────────────

test("isValidCommunitySelection accepts any active community id for any role", () => {
  assert.equal(
    isValidCommunitySelection({ requestedCommunityId: "c-firewheel", role: "operations", activeCommunityIds: ACTIVE_IDS }),
    true
  );
});

test("isValidCommunitySelection rejects an inactive/unknown community id", () => {
  assert.equal(
    isValidCommunitySelection({ requestedCommunityId: "c-unknown", role: "admin", activeCommunityIds: ACTIVE_IDS }),
    false
  );
});

test("isValidCommunitySelection gates the all-communities sentinel by role", () => {
  assert.equal(
    isValidCommunitySelection({ requestedCommunityId: ALL_COMMUNITIES_SELECTION, role: "admin", activeCommunityIds: ACTIVE_IDS }),
    true
  );
  assert.equal(
    isValidCommunitySelection({ requestedCommunityId: ALL_COMMUNITIES_SELECTION, role: "manager", activeCommunityIds: ACTIVE_IDS }),
    false
  );
});

// ─── Care model neutrality (Phase D.5) ─────────────────────────────────────
// resolveCurrentCommunityScope/isValidCommunitySelection operate purely on
// community ids -- they never see a Community row's care_model at all.
// This proves that structurally: mixing community_care and
// traditional_care ids into the same activeCommunityIds set produces
// identical behavior for both, and existing Frisco (community_care)
// resolution is completely unaffected by traditional_care ids now also
// being present in the set.
const MIXED_CARE_MODEL_IDS = new Set(["c-frisco", "c-firewheel", "c-mckinney", "c-frisco-lakes", "c-heritage-ranch"]);

test("a traditional_care community id resolves through the scope exactly like a community_care one", () => {
  const communityCareResult = resolveCurrentCommunityScope({
    cookieCommunityId: "c-frisco",
    homeCommunityId: null,
    role: "manager",
    activeCommunityIds: MIXED_CARE_MODEL_IDS,
  });
  const traditionalCareResult = resolveCurrentCommunityScope({
    cookieCommunityId: "c-frisco-lakes",
    homeCommunityId: null,
    role: "manager",
    activeCommunityIds: MIXED_CARE_MODEL_IDS,
  });
  assert.deepEqual(communityCareResult, { mode: "single_community", communityId: "c-frisco" });
  assert.deepEqual(traditionalCareResult, { mode: "single_community", communityId: "c-frisco-lakes" });
});

test("existing Frisco (community_care) resolution is unchanged by traditional_care ids being present in the active set", () => {
  const result = resolveCurrentCommunityScope({
    cookieCommunityId: null,
    homeCommunityId: "c-frisco",
    role: "manager",
    activeCommunityIds: MIXED_CARE_MODEL_IDS,
  });
  assert.deepEqual(result, { mode: "single_community", communityId: "c-frisco" });
});

test("isValidCommunitySelection accepts a traditional_care id exactly like a community_care one", () => {
  assert.equal(
    isValidCommunitySelection({ requestedCommunityId: "c-heritage-ranch", role: "operations", activeCommunityIds: MIXED_CARE_MODEL_IDS }),
    true
  );
  assert.equal(
    isValidCommunitySelection({ requestedCommunityId: "c-frisco", role: "operations", activeCommunityIds: MIXED_CARE_MODEL_IDS }),
    true
  );
});

// ─── isCommunityAccessAuthorized (Phase E/F access model) ──────────────────

test("every current internal role is authorized for every active community today", () => {
  const roles: Array<"admin" | "manager" | "executive" | "operations"> = ["admin", "manager", "executive", "operations"];
  for (const role of roles) {
    assert.equal(
      isCommunityAccessAuthorized({ role, communityId: "c-firewheel", activeCommunityIds: ACTIVE_IDS }),
      true,
      `${role} should be authorized for an active community`
    );
  }
});

test("no role is authorized for an inactive/unknown community id", () => {
  assert.equal(
    isCommunityAccessAuthorized({ role: "admin", communityId: "c-unknown", activeCommunityIds: ACTIVE_IDS }),
    false
  );
});

// ─── communityScopeToQueryFilter ───────────────────────────────────────────

test("single_community maps to an explicit single-mode filter when authorized", () => {
  const filter = communityScopeToQueryFilter(
    { mode: "single_community", communityId: "c-frisco" },
    { role: "manager", activeCommunityIds: ACTIVE_IDS }
  );
  assert.deepEqual(filter, { mode: "single", communityId: "c-frisco" });
});

test("single_community with an unauthorized/unknown id maps to none, never to all", () => {
  const filter = communityScopeToQueryFilter(
    { mode: "single_community", communityId: "c-not-a-real-community" },
    { role: "admin", activeCommunityIds: ACTIVE_IDS }
  );
  assert.deepEqual(filter, { mode: "none" });
});

test("all_communities maps to the all filter only for a role that can select it", () => {
  const admin = communityScopeToQueryFilter({ mode: "all_communities" }, { role: "admin", activeCommunityIds: ACTIVE_IDS });
  assert.deepEqual(admin, { mode: "all" });

  // Should not normally happen (resolveDefaultCommunityScope wouldn't
  // produce all_communities for a non-admin role) but the mapping must
  // fail safe on its own if it ever did.
  const manager = communityScopeToQueryFilter({ mode: "all_communities" }, { role: "manager", activeCommunityIds: ACTIVE_IDS });
  assert.deepEqual(manager, { mode: "none" });
});

test("unassigned and non_community both map to none, never all — the explicit 'return nothing' rule", () => {
  assert.deepEqual(
    communityScopeToQueryFilter({ mode: "unassigned" }, { role: "manager", activeCommunityIds: ACTIVE_IDS }),
    { mode: "none" }
  );
  assert.deepEqual(
    communityScopeToQueryFilter({ mode: "non_community" }, { role: "manager", activeCommunityIds: ACTIVE_IDS }),
    { mode: "none" }
  );
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
