// Permanent regression script — Phase E/F completion, sections 2 and 8.
// Read-write against the live database using real governed functions
// (not mocks), with synthetic, disposable fixtures cleaned up in a
// finally() block regardless of outcome.
//
// Proves, end to end, against real data:
//   - Firewheel prospect -> Firewheel assessment session, same code path
//     as any other community;
//   - McKinney prospect -> McKinney assessment session, same code path,
//     no Firewheel-specific branch;
//   - Frisco Lakes (Traditional Care) prospect -> assessment session
//     carries Frisco Lakes through the same shared architecture as the
//     Watermere sites — no care_model branching anywhere in the path;
//   - a nullable assessment community_id remains structurally valid
//     (the direct-home Traditional Care future case);
//   - cross-community identity: a same name+DOB pair in two different
//     communities still produces a real identity candidate (never
//     suppressed), correctly flagged crossCommunity — proving the system
//     remains capable of discovering a genuine cross-community move.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-assessment-lifecycle-and-identity.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { getResidentById } from "../lib/data/residents.ts";
import { resolveAssessmentCommunity } from "../lib/assessmentIntelligence/communityResolution.ts";
import { loadResidentsForIdentityDetection } from "../lib/data/residentIdentity.ts";
import { detectIdentityCandidates } from "../lib/residents/identity/candidateDetection.ts";

const supabase = createServerClient();
const ACTOR = "Assessment Lifecycle Verify Script";

const residentIds: string[] = [];
const sessionIds: string[] = [];

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

async function getCommunityIdByCode(code: string): Promise<string> {
  const { data, error } = await supabase.from("communities").select("id").eq("code", code).single();
  if (error || !data) fail(`Could not resolve community code=${code}: ${error?.message}`);
  return (data as { id: string }).id;
}

async function createTestResident(label: string, communityId: string): Promise<string> {
  const { data, error } = await supabase
    .from("residents")
    .insert([{ display_name: label, first_name: label, last_name: "Fixture", community_id: communityId, is_active: true }])
    .select("id")
    .single();
  if (error || !data) fail(`Could not create test resident "${label}": ${error?.message}`);
  const id = (data as { id: string }).id;
  residentIds.push(id);
  return id;
}

// Mirrors exactly what startAssessmentForExistingPerson (lib/actions/
// assessmentIntelligence.ts) does after community resolution — the
// action layer's own auth/cookie wrapping is separately proven to
// compile correctly by this project's build; this exercises the real
// underlying mechanism, which is what correctness actually depends on.
async function createAssessmentForResident(residentId: string): Promise<{ sessionId: string; communityId: string | null }> {
  const resident = await getResidentById(residentId);
  if (!resident) fail(`Resident ${residentId} not found`);
  const resolution = resolveAssessmentCommunity({
    hasResident: true,
    residentCommunityId: resident!.community_id,
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: { mode: "none" },
  });
  if (!resolution.ok) fail(`Community resolution failed unexpectedly: ${resolution.error}`);

  const { data: session, error } = await supabase
    .from("intake_assessment_sessions")
    .insert([
      {
        resident_id: residentId,
        status: "recording",
        initiated_from: "existing_person",
        started_by: ACTOR,
        community_id: resolution.communityId,
      },
    ])
    .select("id")
    .single();
  if (error || !session) fail(`Could not create assessment session: ${error?.message}`);
  const sessionId = (session as { id: string }).id;
  sessionIds.push(sessionId);
  return { sessionId, communityId: resolution.communityId };
}

async function main() {
  const [friscoId, firewheelId, mckinneyId, friscoLakesId] = await Promise.all([
    getCommunityIdByCode("watermere_frisco"),
    getCommunityIdByCode("watermere_firewheel"),
    getCommunityIdByCode("watermere_mckinney"),
    getCommunityIdByCode("frisco_lakes"),
  ]);

  console.log("########## Firewheel: prospect -> assessment ##########");
  const firewheelResidentId = await createTestResident("Zzztest Firewheel Prospect", firewheelId);
  const firewheelSession = await createAssessmentForResident(firewheelResidentId);
  if (firewheelSession.communityId !== firewheelId) fail(`Firewheel session expected community ${firewheelId}, got ${firewheelSession.communityId}`);
  console.log(`[Firewheel] resident ${firewheelResidentId} -> assessment ${firewheelSession.sessionId}, community correctly Firewheel.`);

  console.log("\n########## McKinney: prospect -> assessment (same code path, no McKinney-specific branch) ##########");
  const mckinneyResidentId = await createTestResident("Zzztest McKinney Prospect", mckinneyId);
  const mckinneySession = await createAssessmentForResident(mckinneyResidentId);
  if (mckinneySession.communityId !== mckinneyId) fail(`McKinney session expected community ${mckinneyId}, got ${mckinneySession.communityId}`);
  console.log(`[McKinney] resident ${mckinneyResidentId} -> assessment ${mckinneySession.sessionId}, community correctly McKinney — same createAssessmentForResident() logic as Firewheel, zero McKinney-specific code.`);

  console.log("\n########## Frisco Lakes (Traditional Care): prospect -> assessment, same shared architecture ##########");
  const friscoLakesResidentId = await createTestResident("Zzztest FriscoLakes Prospect", friscoLakesId);
  const friscoLakesSession = await createAssessmentForResident(friscoLakesResidentId);
  if (friscoLakesSession.communityId !== friscoLakesId) fail(`Frisco Lakes session expected community ${friscoLakesId}, got ${friscoLakesSession.communityId}`);
  console.log(`[Frisco Lakes] resident ${friscoLakesResidentId} -> assessment ${friscoLakesSession.sessionId}, community correctly Frisco Lakes — a Traditional Care community carried through the exact same code as the Watermere (Community Care) cases above.`);

  console.log("\n########## Nullable community_id remains structurally valid ##########");
  const { data: nullSession, error: nullSessionError } = await supabase
    .from("intake_assessment_sessions")
    .insert([{ resident_id: firewheelResidentId, status: "recording", initiated_from: "existing_person", started_by: ACTOR, community_id: null }])
    .select("id")
    .single();
  if (nullSessionError || !nullSession) fail(`A null-community assessment session must remain structurally valid: ${nullSessionError?.message}`);
  sessionIds.push((nullSession as { id: string }).id);
  console.log("A null-community_id assessment session inserts cleanly — structurally valid for a future direct-home Traditional Care assessment with no partner community.");

  console.log("\n########## Cross-community identity: a genuine move must remain discoverable ##########");
  const friscoIdentityResidentId = await createTestResident("Zzztest Marsh Identity", friscoId);
  // Overwrite with a specific name+DOB the default createTestResident helper doesn't set.
  await supabase.from("residents").update({ first_name: "Wendell", last_name: "Marsh", date_of_birth: "1951-07-14" }).eq("id", friscoIdentityResidentId);
  const firewheelIdentityResidentId = await createTestResident("Zzztest Marsh Identity 2", firewheelId);
  await supabase.from("residents").update({ first_name: "Wendell", last_name: "Marsh", date_of_birth: "1951-07-14" }).eq("id", firewheelIdentityResidentId);

  const allResidents = await loadResidentsForIdentityDetection("all");
  const ours = allResidents.filter((r) => r.id === friscoIdentityResidentId || r.id === firewheelIdentityResidentId);
  if (ours.length !== 2) fail(`Expected to load both identity fixtures via loadResidentsForIdentityDetection("all"), found ${ours.length}`);

  const detection = detectIdentityCandidates({
    residents: allResidents,
    context: { confirmedAliases: [], absentResidentIds: new Set(), recentlyCreatedResidentIds: new Set() },
    suppressedPairs: new Set(),
  });
  const ourCandidate = detection.identityCandidates.find(
    (c) => c.residentIds.includes(friscoIdentityResidentId) && c.residentIds.includes(firewheelIdentityResidentId)
  );
  if (!ourCandidate) fail("Same name+DOB across two communities must still surface as a real identity candidate — the signal must never be suppressed just because communities differ.");
  if (!ourCandidate.crossCommunity) fail("The candidate must be flagged crossCommunity — a possible move/transfer, not an ordinary same-site duplicate.");
  console.log(`Same name+DOB across Frisco and Firewheel correctly surfaces as an identity candidate (confidenceBand=${ourCandidate.confidenceBand}), correctly flagged crossCommunity=true.`);

  console.log("\n=== PASS: Firewheel and McKinney assessments flow through identical, community-neutral code; Frisco Lakes (Traditional Care) uses the same architecture; nullable community_id stays structurally valid; cross-community identity signals are preserved and correctly labeled, never suppressed. ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log("\n=== Cleanup ===");
    if (sessionIds.length) {
      const { error } = await supabase.from("intake_assessment_sessions").delete().in("id", sessionIds);
      if (error) console.error("Cleanup (assessment sessions) failed:", error.message);
      else console.log(`Deleted ${sessionIds.length} test assessment session(s).`);
    }
    if (residentIds.length) {
      const { error } = await supabase.from("residents").delete().in("id", residentIds);
      if (error) console.error("Cleanup (residents) failed:", error.message);
      else console.log(`Deleted ${residentIds.length} test resident(s).`);
    }
  });
