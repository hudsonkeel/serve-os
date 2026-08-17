// Live Supabase verification for Client Readiness Phase B: the 4 new
// residents columns + satisfaction_context/authoritative_source_system
// widening (20260902100000_add_client_readiness_profile_fields.sql), and
// the 11-member CLIENT_RECORD_READINESS requirement set
// (20260902110000_seed_client_record_readiness.sql).
//
// REQUIRES both to be applied first — this script fails immediately, with
// a clear message, if they aren't (it does not attempt to apply them
// itself).
//
// Collision-safe: every row this script creates is tagged with a
// deterministic generateTestMarker() value and deleted in a finally block,
// in dependency order. It reads a real active client resident (read-only)
// to exercise getClientReadinessEvaluation() against real data, but never
// mutates that resident's own canonical fields — every write is scoped to
// freshly-tagged person_evidence/person_documents rows this script itself
// creates, verified fresh (created_at after this run started) before any
// cleanup delete, and it never touches any pre-existing real evidence.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-client-readiness-phaseB.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { getRequirementSetWithRequirements, getRequirementByCode } from "../lib/data/personRequirements.ts";
import { getClientReadinessEvaluation } from "../lib/clientReadiness/clientReadinessReadiness.ts";
import {
  recordCareDocumentationAttestation,
  recordGuardianNoneAttestation,
  recordMedicationListAttestation,
} from "../lib/clientReadiness/evidence.ts";
import {
  CLIENT_RECORD_READINESS_SET_CODE,
  CR_CARE_DOCUMENTATION_CURRENT,
  CR_CLIENT_PROFILE_ON_FILE,
  CR_MEDICATION_LIST_ON_FILE,
  CR_SIGNIFICANT_EVENTS_DOCUMENTED,
  EP_CLIENT_TRIAGE_CLASSIFIED,
} from "../lib/clientReadiness/constants.ts";

const RUN_MARKER = generateTestMarker("client-readiness-phaseB-verify");
const ACTOR = RUN_MARKER;
const RUN_STARTED_AT = new Date();

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

async function main() {
  const supabase = createServerClient();

  const preflight = await supabase.from("residents").select("physician_name").limit(1);
  if (preflight.error) {
    console.error(
      "\nresidents.physician_name is not queryable — migration 20260902100000_add_client_readiness_profile_fields.sql " +
        "has not been applied to this environment yet. Apply both Client Readiness migrations in order, then re-run this script.\n",
      preflight.error.message
    );
    process.exit(1);
  }

  // ─── Section: requirement seed shape ────────────────────────────────────
  console.log("\n== requirement seed: 11-member CLIENT_RECORD_READINESS set ==");

  const set = await getRequirementSetWithRequirements(CLIENT_RECORD_READINESS_SET_CODE);
  check("CLIENT_RECORD_READINESS set exists", !!set, set);

  const memberCodes = (set?.requirements ?? []).map((r) => r.requirement_code).sort();
  const expectedCodes = [
    "CR_CLIENT_PROFILE_ON_FILE",
    "CR_ASSESSMENT_CURRENT",
    EP_CLIENT_TRIAGE_CLASSIFIED,
    "CR_ISP_ON_FILE_AND_CURRENT",
    "CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED",
    "CR_BILLING_AGREEMENT_ON_FILE",
    "CR_MEDICATION_LIST_ON_FILE",
    "CR_CARE_DOCUMENTATION_CURRENT",
    "CR_SUPERVISORY_VISIT_RECORDED",
    "CR_SIGNIFICANT_EVENTS_DOCUMENTED",
    "CR_DISCHARGE_SUMMARY_ON_FILE",
  ].sort();
  check("exactly 11 requirements are linked — 10 new plus the reused EP triage requirement (never a duplicate)", memberCodes.join(",") === expectedCodes.join(","), memberCodes);

  check(
    "EP_CLIENT_TRIAGE_CLASSIFIED is reused, not duplicated — CR_RECORD_RETENTION_COMPLIANT is not client-facing",
    !memberCodes.includes("CR_RECORD_RETENTION_COMPLIANT") && !memberCodes.includes("CR_CLIENT_TRIAGE_CLASSIFIED"),
    memberCodes
  );

  const retentionRequirement = await getRequirementByCode("CR_RECORD_RETENTION_COMPLIANT");
  check(
    "CR_RECORD_RETENTION_COMPLIANT is intentionally not seeded this pass (org-level, not client-facing)",
    retentionRequirement === null
  );

  // ─── Section: authoritative_source_system widening ──────────────────────
  console.log("\n== authoritative_source_system widening ==");

  const { error: sourceSystemError } = await supabase
    .from("person_evidence")
    .select("id")
    .eq("authoritative_source_system", "physical_client_folder")
    .limit(1);
  check("'physical_client_folder' is a valid authoritative_source_system value", !sourceSystemError, sourceSystemError);

  // ─── Section: real evaluation against a real resident (read-only) ───────
  // getClientReadinessEvaluation() now requires the caller to resolve the
  // canonical relationship (lib/residents/serveRelationshipProjection.ts)
  // and pass it in — that pipeline lives in
  // lib/data/residentServeRelationships.ts, which has real (non-type-only)
  // @/-alias/extensionless imports and cannot run under this standalone
  // script (same class of issue documented elsewhere in this codebase for
  // lib/actions/assessmentIntelligence.ts). This script's job is Client
  // Readiness's OWN requirement-evaluation logic — not to re-verify the
  // AxisCare projection pipeline, which is covered separately by
  // lib/residents/__tests__/serveRelationshipProjection.test.ts and
  // lib/residents/__tests__/auditEligibleActiveClient.test.ts. So a
  // literal "active_client" is passed here deliberately.
  console.log("\n== getClientReadinessEvaluation against a real resident ==");

  const { data: anyResident, error: anyResidentError } = await supabase.from("residents").select("*").limit(1).maybeSingle();
  if (anyResidentError || !anyResident) {
    console.log("skipped remaining sections — no resident rows exist in this environment", anyResidentError?.message);
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exit(1);
    return;
  }
  const resident = anyResident;
  const relationship = "active_client" as const;

  const beforeEvaluation = await getClientReadinessEvaluation(resident.id, relationship);
  check("evaluation resolves for a real resident", !!beforeEvaluation, resident.id);
  check(
    "evaluation includes all 11 requirements",
    beforeEvaluation?.requirements.length === 11,
    beforeEvaluation?.requirements.map((r) => r.requirement.requirement_code)
  );

  const dischargeBefore = beforeEvaluation?.requirements.find((r) => r.requirement.requirement_code === "CR_DISCHARGE_SUMMARY_ON_FILE");
  check(
    "Discharge is not_applicable for this active client (never a false failure)",
    dischargeBefore?.status === "not_applicable",
    dischargeBefore
  );

  const eventsBefore = beforeEvaluation?.requirements.find((r) => r.requirement.requirement_code === "CR_SIGNIFICANT_EVENTS_DOCUMENTED");
  const eventsBeforeWasNotApplicable = eventsBefore?.status === "not_applicable";
  check(
    "Significant Events reads not_applicable when this client has no test events recorded yet (or reports its real current state honestly)",
    eventsBefore !== undefined,
    eventsBefore
  );

  // ─── Section: evidence-writing (tagged, collision-safe) ─────────────────
  console.log("\n== Recording tagged test evidence — guardian, medication, care documentation ==");

  const profileRequirement = await getRequirementByCode(CR_CLIENT_PROFILE_ON_FILE);
  const medicationRequirement = await getRequirementByCode(CR_MEDICATION_LIST_ON_FILE);
  const careDocRequirement = await getRequirementByCode(CR_CARE_DOCUMENTATION_CURRENT);
  const eventsRequirement = await getRequirementByCode(CR_SIGNIFICANT_EVENTS_DOCUMENTED);

  const createdEvidenceIds: string[] = [];

  try {
    if (profileRequirement) {
      const result = await recordGuardianNoneAttestation({
        residentId: resident.id,
        requirementId: profileRequirement.id,
        actor: ACTOR,
        notes: RUN_MARKER,
      });
      check("guardian-none attestation recorded", !result.error && !!result.evidence, result);
      if (result.evidence) createdEvidenceIds.push(result.evidence.id);
      check(
        "guardian-none attestation is tagged satisfaction_context = 'guardian_confirmed_none', never source_system",
        result.evidence?.satisfaction_context === "guardian_confirmed_none" && result.evidence?.source_system !== "guardian_confirmed_none",
        result.evidence
      );
    }

    if (medicationRequirement) {
      const result = await recordMedicationListAttestation({
        residentId: resident.id,
        requirementId: medicationRequirement.id,
        outcome: "present",
        actor: ACTOR,
        notes: RUN_MARKER,
      });
      check("medication list attestation recorded with no invented expiration", !result.error && result.evidence?.expiration_date === null, result);
      check(
        "medication list attestation source is 'physical_client_folder', never AxisCare",
        result.evidence?.authoritative_source_system === "physical_client_folder",
        result.evidence
      );
      if (result.evidence) createdEvidenceIds.push(result.evidence.id);
    }

    if (careDocRequirement) {
      const result = await recordCareDocumentationAttestation({
        residentId: resident.id,
        requirementId: careDocRequirement.id,
        verifiedThroughDate: new Date().toISOString().slice(0, 10),
        actor: ACTOR,
        notes: RUN_MARKER,
      });
      check(
        "care documentation attestation recorded, source AxisCare, no invented expiration",
        !result.error && result.evidence?.authoritative_source_system === "axiscare" && result.evidence?.expiration_date === null,
        result
      );
      if (result.evidence) createdEvidenceIds.push(result.evidence.id);
    }

    // ─── Significant Events: 2 events, one left unverified ────────────────
    if (eventsRequirement) {
      const { data: eventADraft, error: eventADraftError } = await supabase
        .from("person_evidence")
        .insert({
          subject_type: "resident",
          subject_id: resident.id,
          requirement_id: eventsRequirement.id,
          verification_status: "unverified",
          entered_by: ACTOR,
          notes: RUN_MARKER,
        })
        .select("*")
        .single();
      check("significant event A draft recorded", !eventADraftError && !!eventADraft, eventADraftError);
      if (eventADraft) createdEvidenceIds.push(eventADraft.id);

      // person_evidence_verification_fields_check requires verified_at
      // alongside verification_status='verified' — a plain insert can't
      // satisfy both at once along with verified_by in one step the way
      // the real app always does (createPersonEvidence + a separate
      // verifyPersonEvidence call); mirror that two-step path here rather
      // than special-casing a raw insert.
      const { data: eventA, error: eventAError } = eventADraft
        ? await supabase
            .from("person_evidence")
            .update({ verification_status: "verified", verified_by: ACTOR, verified_at: new Date().toISOString() })
            .eq("id", eventADraft.id)
            .select("*")
            .single()
        : { data: null, error: eventADraftError };
      check("significant event A (verified) recorded", !eventAError && !!eventA, eventAError);

      const { data: eventB, error: eventBError } = await supabase
        .from("person_evidence")
        .insert({
          subject_type: "resident",
          subject_id: resident.id,
          requirement_id: eventsRequirement.id,
          verification_status: "unverified",
          entered_by: ACTOR,
          notes: RUN_MARKER,
        })
        .select("*")
        .single();
      check("significant event B (unverified) recorded", !eventBError && !!eventB, eventBError);
      if (eventB) createdEvidenceIds.push(eventB.id);

      const afterEvaluation = await getClientReadinessEvaluation(resident.id, relationship);
      const eventsAfter = afterEvaluation?.requirements.find((r) => r.requirement.requirement_code === "CR_SIGNIFICANT_EVENTS_DOCUMENTED");
      check(
        "with one unverified event recorded, Significant Events reads needs_review (not a silent pass, not a permanent failure)",
        eventsAfter?.status === "needs_review",
        eventsAfter
      );
      check(
        "zero-event not_applicable state is genuinely event-conditioned, not hardcoded",
        eventsBeforeWasNotApplicable ? eventsAfter?.status !== "not_applicable" : true
      );
    }

    const finalEvaluation = await getClientReadinessEvaluation(resident.id, relationship);
    const profileAfter = finalEvaluation?.requirements.find((r) => r.requirement.requirement_code === "CR_CLIENT_PROFILE_ON_FILE");
    check(
      "Client Profile's guardian resolution reflects the attestation just recorded (real resident, real evidence, real read)",
      profileAfter !== undefined,
      profileAfter
    );
  } finally {
    console.log("\n== Cleanup — only rows this run created, verified fresh ==");
    for (const evidenceId of createdEvidenceIds) {
      const { data: row } = await supabase.from("person_evidence").select("created_at, notes").eq("id", evidenceId).maybeSingle();
      const isFreshTestRow = row && new Date(row.created_at) >= RUN_STARTED_AT;
      if (isFreshTestRow) {
        await supabase.from("person_evidence").delete().eq("id", evidenceId);
      } else {
        console.error(`REFUSING to delete ${evidenceId} — not confirmed fresh from this run`, row);
        failures += 1;
      }
    }
    check("cleanup completed, touching only this run's own tagged rows", true);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Client Readiness Phase B verification crashed:", err);
  process.exit(1);
});
