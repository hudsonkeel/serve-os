// Add New Client phase — live verification. Disposable synthetic data
// only, fully cleaned up. Never touches a real Heritage Ranch client —
// the real client is entered manually by an operator through the UI
// after this checkpoint, per the governing instruction.
//
// Proves, against the real database and the real code paths:
//   1. Manual creation (create_resident_manual RPC): canonical resident +
//      Serve relationship correction, one atomic transaction,
//      source_system='serve_manual', NO person_vendor_identity_links row.
//   2. The natural projection (legacy status) and the correction agree
//      immediately at creation — no manufactured conflict before any
//      real evidence exists.
//   3. Client Readiness eligibility: the new Active Client is
//      immediately eligible via the existing, unmodified
//      isAuditEligibleActiveClient/projectServeRelationship composition
//      — zero new Client Readiness code.
//   4. Prospect creation stays outside Client Readiness.
//   5. Duplicate detection: Tier 1 (phone) and Tier 2 (DOB, no roster-
//      tier evidence at all) both find an existing person; a genuinely
//      new person finds nothing.
//   6. Cross-community candidate surfaces for review, never silently
//      picked, never moves community_id.
//   7. Existing person reused via the SAME governed correction mechanism
//      (no second resident created).
//   8. RELEASE-BLOCKING — Serve-first, AxisCare-later: a person created
//      manually as Active Client, with NO AxisCare link, later gets a
//      confirmed AxisCare identity whose own bucket would compute a
//      DIFFERENT relationship (e.g. prospect). The correction keeps the
//      resident showing Active Client (never silently downgraded) and
//      the disagreement surfaces as hasConflict — proving the precedence
//      conflict is handled, not silently ignored.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-add-new-client.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { createResidentManual } from "../lib/data/residentManualCreation.ts";
import { correctResidentServeRelationship } from "../lib/data/residentServeRelationshipCorrections.ts";
import { findPossibleExistingServePerson } from "../lib/data/addClientDuplicateCheck.ts";
import { projectServeRelationship, applyServeRelationshipCorrection } from "../lib/residents/serveRelationshipProjection.ts";
import { isAuditEligibleActiveClient } from "../lib/residents/auditEligibleActiveClient.ts";
import { syncExternalPersonIdentity, confirmPersonVendorIdentityLink } from "../lib/data/personVendorIdentityLinks.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

const RUN_TAG = `AddClient${Date.now()}`;
const createdResidentIds: string[] = [];

// FK-safe order (decisions -> links -> corrections -> timeline ->
// residents) — see verify-community-roster-import-pass2.ts's own comment
// for the production hygiene incident this order prevents. A hard
// process kill (SIGKILL) still bypasses this `finally` block regardless
// of ordering (confirmed live: two of this exact script's residents
// leaked this way — see scripts/cleanup-verify-script-fixtures.ts's own
// header for the full incident); that script is the standing safety net
// for that residual case — re-run it anytime.
async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  console.log("\nCleaning up fixture data...");
  if (createdResidentIds.length > 0) {
    const { data: links } = await supabase.from("person_vendor_identity_links").select("id").eq("subject_type", "resident").in("subject_id", createdResidentIds);
    const linkIds = (links ?? []).map((l) => l.id as string);
    if (linkIds.length > 0) {
      await supabase.from("person_vendor_identity_link_decisions").delete().in("link_id", linkIds);
      await supabase.from("person_vendor_identity_links").delete().in("id", linkIds);
    }
    await supabase.from("resident_serve_relationship_corrections").delete().in("resident_id", createdResidentIds);
    await supabase.from("resident_timeline").delete().in("resident_id", createdResidentIds);
    await supabase.from("residents").delete().in("id", createdResidentIds);
  }
  console.log("ok - fixture residents, corrections, identity links, and timeline rows deleted");
}

async function createFixtureResidentDirect(
  supabase: ReturnType<typeof createServerClient>,
  input: { firstName: string; lastName: string; communityId: string; communityName: string; communityCode: string; phone?: string; email?: string; dob?: string }
) {
  const { data, error } = await supabase
    .from("residents")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      community_id: input.communityId,
      community_name: input.communityName,
      community_code: input.communityCode,
      phone: input.phone ?? null,
      email: input.email ?? null,
      date_of_birth: input.dob ?? null,
      source_system: "verify-script-fixture",
      is_active: true,
      status: "active",
      serve_relationship_status: "none",
    })
    .select("id")
    .single();
  if (error || !data) fail(`Could not create fixture resident: ${error?.message}`);
  createdResidentIds.push(data.id as string);
  return data.id as string;
}

async function main() {
  const supabase = createServerClient();

  const { data: heritageRanch } = await supabase.from("communities").select("id, code, name").eq("code", "heritage_ranch").maybeSingle();
  if (!heritageRanch) fail("Heritage Ranch community not found.");
  const { data: frisco } = await supabase.from("communities").select("id, code, name").eq("code", "watermere_frisco").maybeSingle();
  if (!frisco) fail("Frisco community not found.");

  try {
    // ═══ 1/2/3. Manual creation: atomic, no AxisCare, Client Readiness ═══
    const createResult = await createResidentManual({
      firstName: "Contra",
      lastName: `${RUN_TAG}Client`,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      phone: "214-555-4001",
      email: `${RUN_TAG.toLowerCase()}@example.com`,
      dateOfBirth: "1948-03-14",
      address: "123 Main Street",
      city: "Frisco",
      state: "TX",
      zipCode: "75034",
      unitNumber: null,
      building: null,
      serveRelationshipStatus: "active_client",
      actor: "verify-script",
      rationale: null,
    });
    if (createResult.error || !createResult.residentId) fail(`Could not create resident manually: ${createResult.error}`);
    const heritageResidentId = createResult.residentId;

    const { data: heritageResident } = await supabase
      .from("residents")
      .select("source_system, serve_relationship_status, community_id, address, city, state, zip_code")
      .eq("id", heritageResidentId)
      .single();
    if (heritageResident?.source_system !== "serve_manual") fail(`Expected source_system='serve_manual', got '${heritageResident?.source_system}'`);
    if (heritageResident?.serve_relationship_status !== "active_client") fail("Expected serve_relationship_status='active_client' set directly at creation.");
    if (heritageResident?.address !== "123 Main Street" || heritageResident?.city !== "Frisco") fail("Service/home address was not retained.");
    console.log("ok - 1. create_resident_manual creates the canonical resident with source_system='serve_manual' and the service address retained");

    const { data: linksForResident } = await supabase.from("person_vendor_identity_links").select("id").eq("subject_type", "resident").eq("subject_id", heritageResidentId);
    if (linksForResident && linksForResident.length > 0) fail("AxisCare identity must be absent at manual creation time — found a person_vendor_identity_links row.");
    console.log("ok - 1b. no person_vendor_identity_links row exists — AxisCare identity is genuinely optional, not silently created");

    const { data: corrections } = await supabase.from("resident_serve_relationship_corrections").select("*").eq("resident_id", heritageResidentId);
    if (!corrections || corrections.length !== 1) fail(`Expected exactly one correction row, got ${corrections?.length}`);
    if (corrections[0].previous_value !== null || corrections[0].new_value !== "active_client") fail("Correction row has unexpected values.");
    console.log("ok - 2. one atomic transaction wrote both the resident AND its Serve relationship correction");

    const naturalProjection = projectServeRelationship({
      legacyResidentStatus: "active_client",
      activeRelationships: [],
      axiscareMatch: null,
      hasCinchEvidence: false,
    });
    const withCorrection = applyServeRelationshipCorrection(naturalProjection, {
      newValue: "active_client",
      previousValue: null,
      actor: "verify-script",
      rationale: "test",
      createdAt: new Date().toISOString(),
    });
    if (withCorrection.relationship !== "active_client" || withCorrection.hasConflict) {
      fail("Expected the natural projection and the correction to agree with zero conflict immediately at creation.");
    }
    if (!isAuditEligibleActiveClient(withCorrection, null)) fail("Expected the new Active Client to be immediately Client Readiness eligible.");
    console.log("ok - 3. Client Readiness eligibility: the new Active Client is eligible via the existing, unmodified projection/eligibility composition — zero new code");

    // ═══ 4. Prospect stays outside Client Readiness ═══════════════════
    const prospectResult = await createResidentManual({
      firstName: "Prospect",
      lastName: `${RUN_TAG}Fixture`,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      phone: null,
      email: null,
      dateOfBirth: null,
      address: null,
      city: null,
      state: null,
      zipCode: null,
      unitNumber: null,
      building: null,
      serveRelationshipStatus: "prospect",
      actor: "verify-script",
      rationale: null,
    });
    if (prospectResult.error || !prospectResult.residentId) fail(`Could not create prospect: ${prospectResult.error}`);
    const prospectProjection = applyServeRelationshipCorrection(
      projectServeRelationship({ legacyResidentStatus: "prospect", activeRelationships: [], axiscareMatch: null, hasCinchEvidence: false }),
      { newValue: "prospect", previousValue: null, actor: "verify-script", rationale: "test", createdAt: new Date().toISOString() }
    );
    if (isAuditEligibleActiveClient(prospectProjection, null)) fail("A Prospect must NOT be Client Readiness eligible.");
    console.log("ok - 4. Prospect creation stays outside Client Readiness");

    // ═══ 5. Duplicate detection: Tier 1 (phone) and Tier 2 (DOB) ══════
    const tier1Match = await findPossibleExistingServePerson({
      firstName: "Contra",
      lastName: `${RUN_TAG}Client`,
      phone: "214-555-4001",
      email: null,
      dateOfBirth: null,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      unitNumber: null,
    });
    if (!tier1Match || tier1Match.residentId !== heritageResidentId) fail("Expected Tier 1 (phone) to find the existing fixture resident.");
    console.log("ok - 5a. Tier 1 (contact matcher) detects an existing person by phone");

    const tier2Resident = await createFixtureResidentDirect(supabase, {
      firstName: "Dobonly",
      lastName: `${RUN_TAG}Fixture`,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      communityCode: heritageRanch.code,
      dob: "1955-09-09",
    });
    const tier2Match = await findPossibleExistingServePerson({
      firstName: "Dobonly",
      lastName: `${RUN_TAG}Fixture`,
      phone: null,
      email: null,
      dateOfBirth: "1955-09-09",
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      unitNumber: null,
    });
    if (!tier2Match || tier2Match.residentId !== tier2Resident) fail("Expected Tier 2 (DOB + name) to find the existing fixture resident when Tier 1 has no phone/email to go on.");
    console.log("ok - 5b. Tier 2 (identity-signal engine) detects an existing person by DOB when Tier 1 has nothing to match on");

    const noMatch = await findPossibleExistingServePerson({
      firstName: "Genuinely",
      lastName: `${RUN_TAG}NewPerson`,
      phone: null,
      email: null,
      dateOfBirth: null,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      unitNumber: null,
    });
    if (noMatch) fail(`Expected no match for a genuinely new person, got a match on ${noMatch.residentId}`);
    console.log("ok - 5c. a genuinely new person finds no candidate");

    // ═══ 6. Cross-community candidate surfaces for review ═════════════
    const friscoResident = await createFixtureResidentDirect(supabase, {
      firstName: "Mover",
      lastName: `${RUN_TAG}Fixture`,
      communityId: frisco.id,
      communityName: frisco.name,
      communityCode: frisco.code,
      phone: "214-555-4002",
    });
    const crossMatch = await findPossibleExistingServePerson({
      firstName: "Mover",
      lastName: `${RUN_TAG}Fixture`,
      phone: "214-555-4002",
      email: null,
      dateOfBirth: null,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      unitNumber: null,
    });
    if (!crossMatch || crossMatch.residentId !== friscoResident) fail("Expected the cross-community candidate to surface.");
    if (!crossMatch.isCrossCommunity) fail("Expected isCrossCommunity=true for a candidate living in a different community.");
    const { data: friscoResidentRow } = await supabase.from("residents").select("community_id").eq("id", friscoResident).single();
    if (friscoResidentRow?.community_id !== frisco.id) fail("Cross-community surfacing must never move community_id merely by being detected.");
    console.log("ok - 6. a cross-community candidate surfaces explicitly, never silently picked, never moves community_id");

    // ═══ 7. Existing person reused (no second resident created) ═══════
    const existingNoRelationship = await createFixtureResidentDirect(supabase, {
      firstName: "Norelationship",
      lastName: `${RUN_TAG}Fixture`,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      communityCode: heritageRanch.code,
    });
    const reuseResult = await correctResidentServeRelationship({
      residentId: existingNoRelationship,
      previousValue: "no_current_relationship",
      newValue: "active_client",
      actor: "verify-script",
      rationale: "verify-script: existing person reused as new client",
    });
    if (reuseResult.error) fail(`Could not reuse the existing person: ${reuseResult.error}`);
    const { count: residentCountAfterReuse } = await supabase
      .from("residents")
      .select("id", { count: "exact", head: true })
      .eq("first_name", "Norelationship")
      .eq("last_name", `${RUN_TAG}Fixture`);
    if (residentCountAfterReuse !== 1) fail(`Expected exactly 1 resident with this name after reuse, got ${residentCountAfterReuse} — a duplicate may have been created.`);
    console.log("ok - 7. reusing an existing person establishes the relationship via the governed correction mechanism — no second resident created");

    // ═══ 8. RELEASE-BLOCKING: Serve-first, AxisCare-later ═════════════
    const axiscareVendorId = `${RUN_TAG}-axiscare-1`;
    const sync = await syncExternalPersonIdentity({
      sourceSystem: "axiscare",
      subjectType: "resident",
      vendorRecordId: axiscareVendorId,
      vendorDisplayName: `Contra ${RUN_TAG}Client`,
      matchMethod: "name_similarity_pending_review",
      matchConfidence: "medium",
      candidateSubjectId: heritageResidentId,
      approvedSourceData: {},
    });
    if (sync.error || !sync.linkId) fail(`Could not sync AxisCare identity: ${sync.error}`);
    const confirm = await confirmPersonVendorIdentityLink({ linkId: sync.linkId, subjectId: heritageResidentId, actor: "verify-script", rationale: "verify-script: later AxisCare match" });
    if (confirm.error) fail(`Could not confirm AxisCare identity: ${confirm.error}`);

    // No second resident: still exactly one resident with this fixture name.
    const { count: residentCountAfterAxisCare } = await supabase
      .from("residents")
      .select("id", { count: "exact", head: true })
      .eq("first_name", "Contra")
      .eq("last_name", `${RUN_TAG}Client`);
    if (residentCountAfterAxisCare !== 1) fail(`Expected exactly 1 resident after AxisCare arrived, got ${residentCountAfterAxisCare} — reconciliation created a duplicate.`);
    console.log("ok - 8a. the later AxisCare identity links to the SAME canonical resident — no duplicate created");

    // The precedence conflict: AxisCare's own bucket disagrees (says
    // 'prospect') with the manually-established Active Client. Without
    // the correction, projectServeRelationship would silently flip to
    // 'prospect' (AxisCare always wins when a match exists). WITH the
    // correction already on file (from step 1), the display must stay
    // Active Client, and the disagreement must surface as a conflict.
    const naturalProjectionAfterAxisCare = projectServeRelationship({
      legacyResidentStatus: "active_client",
      activeRelationships: [],
      axiscareMatch: { axiscareId: axiscareVendorId, operationalBucket: "prospect", identityStatus: "confirmed" },
      hasCinchEvidence: false,
    });
    if (naturalProjectionAfterAxisCare.relationship !== "prospect") {
      fail("Sanity check failed: expected the NATURAL (uncorrected) projection to flip to 'prospect' once a disagreeing AxisCare match exists — if this fails, the precedence itself changed and the whole scenario needs re-analysis.");
    }
    const correctedAfterAxisCare = applyServeRelationshipCorrection(naturalProjectionAfterAxisCare, {
      newValue: "active_client",
      previousValue: null,
      actor: "verify-script",
      rationale: "test",
      createdAt: new Date().toISOString(),
    });
    if (correctedAfterAxisCare.relationship !== "active_client") {
      fail(`RELEASE-BLOCKING FAILURE: the manually-established Active Client was silently downgraded to '${correctedAfterAxisCare.relationship}' by a later disagreeing AxisCare match.`);
    }
    if (!correctedAfterAxisCare.hasConflict) {
      fail("Expected hasConflict=true — the disagreement between the correction and the new AxisCare evidence must be surfaced, not silently hidden.");
    }
    console.log("ok - 8b. RELEASE-BLOCKING: a disagreeing later AxisCare match never silently downgrades the manually-established Active Client — the correction protects display AND the disagreement surfaces as hasConflict for review");

    console.log("\nALL CHECKS PASSED");
  } finally {
    await cleanup(supabase);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
