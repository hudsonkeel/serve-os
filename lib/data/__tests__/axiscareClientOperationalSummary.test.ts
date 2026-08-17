import assert from "node:assert/strict";
import { buildAxisCareMatchCandidates } from "../axiscareClientOperationalSummary.ts";
import { matchAxisCareClientToResident, normalizeName } from "../../integrations/axiscare/clientIdentityMatching.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

interface RawResidentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_raw: string | null;
  unit_number: string | null;
  community_name: string | null;
}

function rawResident(overrides: Partial<RawResidentRow> & { id: string }): RawResidentRow {
  return {
    first_name: null,
    last_name: null,
    display_name: null,
    full_name: null,
    email: null,
    phone: null,
    phone_raw: null,
    unit_number: null,
    community_name: null,
    ...overrides,
  };
}

// The exact Elliot/Elliott Goldberg shape: Elliot (one T) is canonical and
// active; Elliott (two Ts) has already been retired/redirected to Elliot
// via Resident Identity Resolution, with a spelling_variant alias created
// at merge time.
const elliot = rawResident({
  id: "elliot-1t",
  first_name: "Elliot",
  last_name: "Goldberg",
  display_name: "Elliot Goldberg",
  unit_number: "6303",
  community_name: "Watermere at Frisco",
});
const elliott = rawResident({
  id: "elliott-2t",
  first_name: "Elliott",
  last_name: "Goldberg",
  display_name: "Elliott Goldberg",
  unit_number: "3107",
  community_name: "Watermere at Frisco",
});
const redirects = [{ duplicate_resident_id: "elliott-2t", canonical_resident_id: "elliot-1t" }];
const aliases = [{ canonical_resident_id: "elliot-1t", normalized_value: "elliott goldberg" }];

test("a redirected duplicate never appears as an independent candidate under its own id", () => {
  const candidates = buildAxisCareMatchCandidates([elliot, elliott], redirects, aliases);
  assert.equal(
    candidates.some((c) => c.id === "elliott-2t"),
    false,
    "the retired duplicate's own resident id must never be a match target"
  );
});

test("the canonical resident's own real name is still a normal candidate", () => {
  const candidates = buildAxisCareMatchCandidates([elliot, elliott], redirects, aliases);
  const own = candidates.find((c) => c.id === "elliot-1t" && c.normalizedName === "elliot goldberg");
  assert.ok(own, "Elliot's own real name must still be a candidate");
  assert.equal(own!.communityName, "Watermere at Frisco");
});

test("the retired duplicate's pre-merge name resolves to the canonical resident id (redirect-derived)", () => {
  const candidates = buildAxisCareMatchCandidates([elliot, elliott], redirects, aliases);
  const viaDuplicateName = candidates.find((c) => c.normalizedName === "elliott goldberg" && c.id === "elliot-1t");
  assert.ok(viaDuplicateName, "Elliott's own spelling must resolve to Elliot's canonical id");
});

test("REGRESSION: an AxisCare client named with the retired spelling matches the CANONICAL resident, not the retired duplicate", () => {
  const candidates = buildAxisCareMatchCandidates([elliot, elliott], redirects, aliases);
  const clientNormalizedName = normalizeName("Elliott", "Goldberg"); // AxisCare Client #9's own spelling
  const match = matchAxisCareClientToResident(
    {
      normalizedEmail: null,
      normalizedPhones: [],
      normalizedName: clientNormalizedName,
      normalizedLastName: "goldberg",
      unitNumber: null,
      communityName: "Watermere at Frisco",
    },
    candidates
  );
  assert.equal(match.residentId, "elliot-1t", "must resolve to the canonical, active resident — never the retired duplicate");
  assert.equal(match.requiresReview, false);
});

test("a confirmed alias alone (no redirect row) is still usable identity evidence for its canonical resident", () => {
  const soloAlias = [{ canonical_resident_id: "elliot-1t", normalized_value: "eli goldberg" }];
  const candidates = buildAxisCareMatchCandidates([elliot, elliott], [], soloAlias);
  // No redirect this time — elliott is untouched, still an ordinary candidate under her own id.
  assert.ok(candidates.some((c) => c.id === "elliott-2t"));
  const viaAlias = candidates.find((c) => c.normalizedName === "eli goldberg" && c.id === "elliot-1t");
  assert.ok(viaAlias, "a standalone alias must still produce a usable candidate row for its canonical resident");
});

test("a redirect or alias pointing at a resident row that no longer exists is safely skipped, never throws", () => {
  const danglingRedirects = [{ duplicate_resident_id: "elliott-2t", canonical_resident_id: "ghost-id" }];
  const danglingAliases = [{ canonical_resident_id: "ghost-id", normalized_value: "ghost name" }];
  const candidates = buildAxisCareMatchCandidates([elliot], danglingRedirects, danglingAliases);
  assert.equal(
    candidates.some((c) => c.normalizedName === "ghost name" || c.id === "ghost-id"),
    false
  );
});

test("candidate rows derived from a redirect/alias never carry email or phone (never win an email/phone-tier match on stale duplicate contact data)", () => {
  const candidates = buildAxisCareMatchCandidates([elliot, elliott], redirects, aliases);
  const derived = candidates.filter((c) => c.id === "elliot-1t" && c.normalizedName !== "elliot goldberg");
  assert.ok(derived.length > 0);
  for (const c of derived) {
    assert.equal(c.normalizedEmail, null);
    assert.deepEqual(c.normalizedPhones, []);
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
