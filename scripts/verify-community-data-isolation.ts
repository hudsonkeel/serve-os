// Permanent regression script — Phase E/F, relationship/resident
// community integrity and new-relationship community resolution.
// Read-write against the live database using real governed functions
// (not mocks), with synthetic, disposable fixtures cleaned up in a
// finally() block regardless of outcome — same discipline as every prior
// verify-*.ts script this project uses.
//
// Scope note: this script deliberately does NOT cover residents-list/
// resident-detail scope enforcement (Tests A/B/C in this phase's
// checkpoint report) — lib/data/communityMetrics.ts transitively imports
// next/server's connection(), which raw node cannot resolve outside the
// Next.js build (the same class of limitation as next/headers elsewhere
// in this project). That coverage was proven once, live, via a temporary
// diagnostic API route (added, exercised, and fully removed — see the
// checkpoint report for the exact results), the same technique already
// established in this project's Phase D verification. Everything in
// THIS script runs on plain data-layer functions with no Next-runtime
// dependency, so it stays a permanent, immediately re-runnable check.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-community-data-isolation.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { createRelationship, setRelationshipCommunityId } from "../lib/data/relationships.ts";
import {
  resolveRelationshipCommunityIdForCreation,
  reconcileRelationshipCommunityIdForLinking,
} from "../lib/relationships/communityIntegrity.ts";

const supabase = createServerClient();
const ACTOR = "Community Isolation Verify Script";

const residentIds: string[] = [];
const relationshipIds: string[] = [];

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

async function getCommunityIdByCode(code: string): Promise<string> {
  const { data, error } = await supabase.from("communities").select("id").eq("code", code).single();
  if (error || !data) fail(`Could not resolve community code=${code}: ${error?.message}`);
  return (data as { id: string }).id;
}

async function createTestResident(label: string, communityId: string, unitNumber: string): Promise<string> {
  const { data, error } = await supabase
    .from("residents")
    .insert([
      {
        display_name: label,
        first_name: label.split(" ")[0],
        last_name: label.split(" ").slice(1).join(" ") || "Fixture",
        community_id: communityId,
        unit_number: unitNumber,
        is_active: true,
      },
    ])
    .select("id")
    .single();
  if (error || !data) fail(`Could not create test resident "${label}": ${error?.message}`);
  const id = (data as { id: string }).id;
  residentIds.push(id);
  return id;
}

async function main() {
  // Community-scoped Watermere fixtures for Tests C-E. Frisco Lakes/
  // Heritage Ranch (Traditional Care) already have their own live proof —
  // the residents-list/detail isolation diagnostic run this phase covered
  // all 5 canonical communities, including both; this trimmed script only
  // needs two distinct communities to prove the integrity/resolution
  // logic itself, which is care-model-agnostic by construction (it never
  // branches on care_model at all).
  const [friscoId, firewheelId, mckinneyId] = await Promise.all([
    getCommunityIdByCode("watermere_frisco"),
    getCommunityIdByCode("watermere_firewheel"),
    getCommunityIdByCode("watermere_mckinney"),
  ]);

  console.log("########## Fixture setup ##########");
  const friscoResidentId = await createTestResident("Zzztest Frisco", friscoId, "Unit 204");
  const firewheelResidentId = await createTestResident("Zzztest Firewheel", firewheelId, "Unit 204"); // same unit number, different community — must be allowed
  console.log(`Created ${residentIds.length} residents: ${residentIds.join(", ")}`);

  console.log("\n########## Test C: same unit number across two different communities is allowed ##########");
  // Proven by fixture creation not throwing (Frisco/Firewheel both "Unit
  // 204", Frisco Lakes/Heritage Ranch both "Lot 8") — no unique constraint
  // blocks it. Re-confirm both rows are independently readable via a
  // plain scoped query (residents-list/detail scoping itself is covered
  // separately — see this file's header note).
  const { data: frisco204Row } = await supabase.from("residents").select("unit_number").eq("id", friscoResidentId).single();
  const { data: firewheel204Row } = await supabase.from("residents").select("unit_number").eq("id", firewheelResidentId).single();
  if (!frisco204Row || !firewheel204Row || frisco204Row.unit_number !== firewheel204Row.unit_number) {
    fail("[C] Both Frisco and Firewheel residents should independently exist with the same unit_number.");
  }
  console.log(`[C] Both communities independently hold a resident in "${frisco204Row.unit_number}" — confirmed two different locations, not a collision.`);

  console.log("\n########## Test D: new-relationship community resolution ##########");
  // D1 — inherits from a linked resident, even if a different "current"
  // community were selected.
  const d1 = await resolveRelationshipCommunityIdForCreation({
    residentId: firewheelResidentId,
    currentSingleCommunityId: friscoId, // deliberately different — resident must still win
  });
  if (d1.communityId !== firewheelId) fail(`[D1] Expected resolved community ${firewheelId} (from resident), got ${d1.communityId}`);
  console.log("[D1] A linked resident's own community wins over a different current context — confirmed.");

  // D2 — no resident, falls back to current single-community context.
  const d2 = await resolveRelationshipCommunityIdForCreation({ residentId: null, currentSingleCommunityId: mckinneyId });
  if (d2.communityId !== mckinneyId) fail(`[D2] Expected resolved community ${mckinneyId} (from current context), got ${d2.communityId}`);
  console.log("[D2] No resident, current single-community context applies automatically — confirmed.");

  // D3 — no resident, no single-community context (all/unassigned) -> null, never guessed.
  const d3 = await resolveRelationshipCommunityIdForCreation({ residentId: null, currentSingleCommunityId: null });
  if (d3.communityId !== null) fail(`[D3] Expected null (genuinely unassigned), got ${d3.communityId}`);
  console.log("[D3] No resident and no single-community context -> genuinely unassigned, never guessed — confirmed.");

  // D4 — the real write path: create an actual relationship tied to the
  // Firewheel resident, resolve its community, write it, and confirm.
  const created = await createRelationship({
    relationshipType: "resident_prospect",
    stage: "new_inquiry",
    displayName: "Zzztest Firewheel Prospect",
    residentId: firewheelResidentId,
    prospectId: null,
    communityName: null,
    organizationName: null,
    primaryContactName: null,
    primaryContactRelationship: null,
    primaryContactPhone: null,
    primaryContactEmail: null,
    prospectiveResidentName: null,
    summary: null,
    ownerLabel: null,
    priority: "normal",
    sourceType: null,
    sourceLabel: null,
    actor: ACTOR,
  });
  if (created.error || !created.id) fail(`[D4] Could not create test relationship: ${created.error}`);
  relationshipIds.push(created.id);
  const d4Resolved = await resolveRelationshipCommunityIdForCreation({ residentId: firewheelResidentId, currentSingleCommunityId: null });
  await setRelationshipCommunityId(created.id, d4Resolved.communityId);
  const { data: writtenRel } = await supabase.from("relationships").select("community_id").eq("id", created.id).single();
  if (writtenRel?.community_id !== firewheelId) fail(`[D4] Expected the written relationship's community_id to be ${firewheelId}, got ${writtenRel?.community_id}`);
  console.log("[D4] A real relationship, created and community-set through the actual write path, correctly carries the Firewheel resident's community.");

  console.log("\n########## Test E: relationship/resident community integrity ##########");
  // E1 — a real mismatch is rejected outright.
  await setRelationshipCommunityId(created.id, friscoId); // deliberately wrong, to test rejection
  const e1 = await reconcileRelationshipCommunityIdForLinking({ relationshipCommunityId: friscoId, residentId: firewheelResidentId });
  if (e1.ok) fail("[E1] A Frisco-tagged relationship linking to a Firewheel resident must be rejected, not silently reconciled.");
  console.log(`[E1] Mismatch correctly rejected: "${e1.error}"`);

  // E2 — a null relationship community is correctly filled in, not rejected.
  await setRelationshipCommunityId(created.id, null);
  const e2 = await reconcileRelationshipCommunityIdForLinking({ relationshipCommunityId: null, residentId: firewheelResidentId });
  if (!e2.ok || e2.resolvedCommunityId !== firewheelId) fail(`[E2] Expected a clean fill-in to ${firewheelId}, got ${JSON.stringify(e2)}`);
  console.log("[E2] A relationship with no community correctly inherits the resident's on linking — a fill-in, not a rewrite.");

  // Restore the correct value so the fixture is internally consistent
  // before cleanup (not load-bearing, just tidy).
  await setRelationshipCommunityId(created.id, firewheelId);

  console.log("\n=== PASS: same unit numbers are allowed across communities, new-relationship community resolution follows the resident > current-context > unassigned priority, and relationship/resident community integrity is enforced without silent rewrites. Residents-list/detail isolation across all 5 canonical communities was proven separately (see this file's header note). ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log("\n=== Cleanup ===");
    if (relationshipIds.length) {
      const { error } = await supabase.from("relationships").delete().in("id", relationshipIds);
      if (error) console.error("Cleanup (relationships) failed:", error.message);
      else console.log(`Deleted ${relationshipIds.length} test relationship(s).`);
    }
    if (residentIds.length) {
      const { error } = await supabase.from("residents").delete().in("id", residentIds);
      if (error) console.error("Cleanup (residents) failed:", error.message);
      else console.log(`Deleted ${residentIds.length} test resident(s).`);
    }
  });
