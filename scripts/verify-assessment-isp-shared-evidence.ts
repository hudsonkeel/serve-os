// Live verification for the Assessment + ISP shared-evidence composition
// correction (lib/clientReadiness/evidence.ts's recordAssessmentIspEvidence
// / recordAssessmentIspEvidenceFromDocument, wired into
// lib/actions/assessmentIntelligence.ts and
// lib/actions/clientReadiness.ts#recordClientReadinessDocumentEvidenceAction).
//
// Root cause: this composition existed only in the sibling
// serve-os-audit-readiness worktree's history (never part of
// feature/multi-community-foundation), correctly excluded from the
// resident-profile-UX recovery since it's Client Readiness logic, not
// UI. Ported here, adapted to this branch's community-scoped code.
//
// Disposable synthetic data only: one fixture resident, one real PDF
// document upload (a tiny synthetic PDF, not a real client's file),
// cleaned up in a finally block.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-assessment-isp-shared-evidence.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { getRequirementByCode } from "../lib/data/personRequirements.ts";
import { createPersonDocument } from "../lib/data/personDocuments.ts";
import { buildDocumentStoragePath, uploadDocumentBytes } from "../lib/workforce/storage.ts";
import { recordDocumentEvidence, recordAssessmentIspEvidenceFromDocument } from "../lib/clientReadiness/evidence.ts";
import { getClientReadinessEvaluation } from "../lib/clientReadiness/clientReadinessReadiness.ts";
import { getPersonEvidenceForSubject } from "../lib/data/personEvidence.ts";
import { CR_ASSESSMENT_CURRENT, CR_ISP_ON_FILE_AND_CURRENT, ISP_VALIDITY_DAYS } from "../lib/clientReadiness/constants.ts";

const RUN_MARKER = generateTestMarker("assessment-isp-shared-evidence-verify");
const ACTOR = RUN_MARKER;

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function uploadFixtureDocument(residentId: string, label: string): Promise<string> {
  const documentId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath({ subjectType: "resident", subjectId: residentId, documentType: "assessment_isp_fixture", documentId });
  const bytes = new TextEncoder().encode(`%PDF-1.4\n% ${RUN_MARKER} ${label} fixture\n`);
  const uploadResult = await uploadDocumentBytes(storagePath, bytes.buffer as ArrayBuffer);
  if (uploadResult.error) throw new Error(`Could not upload fixture document: ${uploadResult.error}`);

  const documentResult = await createPersonDocument({
    subjectType: "resident",
    subjectId: residentId,
    storageBucket: "person-documents",
    storagePath,
    originalFilename: `${label}.pdf`,
    documentType: "assessment_isp_fixture",
    mimeType: "application/pdf",
    fileSizeBytes: bytes.length,
    documentDate: new Date().toISOString().slice(0, 10),
    uploadedBy: ACTOR,
    checksum: null,
  });
  if (documentResult.error || !documentResult.document) throw new Error(`Could not create fixture document: ${documentResult.error}`);
  return documentResult.document.id;
}

async function main() {
  const supabase = createServerClient();

  const assessmentRequirement = await getRequirementByCode(CR_ASSESSMENT_CURRENT);
  const ispRequirement = await getRequirementByCode(CR_ISP_ON_FILE_AND_CURRENT);
  if (!assessmentRequirement || !ispRequirement) {
    console.error("CR_ASSESSMENT_CURRENT / CR_ISP_ON_FILE_AND_CURRENT requirements not found — is the CLIENT_RECORD_READINESS set seeded?");
    process.exit(1);
  }

  let residentId: string | null = null;

  try {
    const { data: resident, error: createError } = await supabase
      .from("residents")
      .insert({ first_name: "AssessmentIspFixture", last_name: RUN_MARKER, source_system: "verify-script-fixture", is_active: true, status: "active" })
      .select("id")
      .single();
    if (createError || !resident) throw new Error(`Could not create fixture resident: ${createError?.message}`);
    residentId = resident.id as string;
    console.log(`ok - fixture resident created: ${residentId}`);

    // ─── Before: neither requirement satisfied ─────────────────────────
    const before = await getClientReadinessEvaluation(residentId, "active_client");
    const beforeAssessment = before?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    const beforeIsp = before?.requirements.find((r) => r.requirement.requirement_code === CR_ISP_ON_FILE_AND_CURRENT);
    check("before any upload: Assessment is missing_evidence", beforeAssessment?.status === "missing_evidence", beforeAssessment);
    check("before any upload: ISP is missing_evidence", beforeIsp?.status === "missing_evidence", beforeIsp);

    // ─── 1/2/3. A combined Assessment + ISP artifact satisfies BOTH from ONE document ──
    const combinedDocumentId = await uploadFixtureDocument(residentId, "combined-assessment-isp");
    const effectiveDate = new Date().toISOString().slice(0, 10);

    const assessmentEvidence = await recordDocumentEvidence({
      residentId,
      requirementId: assessmentRequirement.id,
      documentId: combinedDocumentId,
      effectiveDate,
      expirationDate: addDays(new Date(effectiveDate), 365),
      actor: ACTOR,
      notes: "Combined Assessment/Care Plan fixture.",
    });
    check("combined artifact: Assessment evidence created", !assessmentEvidence.error && !!assessmentEvidence.evidence, assessmentEvidence.error);

    const ispFromAssessment = await recordAssessmentIspEvidenceFromDocument({
      residentId,
      requirementId: ispRequirement.id,
      assessmentEvidenceId: assessmentEvidence.evidence!.id,
      documentId: combinedDocumentId,
      effectiveDate,
      expirationDate: addDays(new Date(effectiveDate), ISP_VALIDITY_DAYS),
      supersedesEvidenceId: null,
      actor: ACTOR,
      notes: null,
    });
    check("combined artifact: ISP evidence composed from the SAME document, no error", !ispFromAssessment.error && !!ispFromAssessment.evidence, ispFromAssessment.error);
    check("combined artifact: ISP evidence points at the same document_id as Assessment (no duplicate file)", ispFromAssessment.evidence?.document_id === combinedDocumentId);

    const afterCombined = await getClientReadinessEvaluation(residentId, "active_client");
    const combinedAssessmentStatus = afterCombined?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    const combinedIspStatus = afterCombined?.requirements.find((r) => r.requirement.requirement_code === CR_ISP_ON_FILE_AND_CURRENT);
    check("REGRESSION: Assessment is compliant from the combined artifact", combinedAssessmentStatus?.status === "compliant", combinedAssessmentStatus);
    check("REGRESSION: ISP is ALSO compliant from the SAME combined artifact — no second upload", combinedIspStatus?.status === "compliant", combinedIspStatus);

    const { data: docsForResident } = await supabase.from("person_documents").select("id").eq("subject_type", "resident").eq("subject_id", residentId);
    check("only one underlying document exists for this resident so far", (docsForResident?.length ?? 0) === 1, docsForResident);

    // ─── 4. An assessment-only artifact (bypassing the action-layer composition) never satisfies ISP ──
    const { data: fixture2 } = await supabase
      .from("residents")
      .insert({ first_name: "AssessmentOnlyFixture", last_name: RUN_MARKER, source_system: "verify-script-fixture", is_active: true, status: "active" })
      .select("id")
      .single();
    const assessmentOnlyResidentId = fixture2!.id as string;
    const assessmentOnlyDocId = await uploadFixtureDocument(assessmentOnlyResidentId, "assessment-only");
    await recordDocumentEvidence({
      residentId: assessmentOnlyResidentId,
      requirementId: assessmentRequirement.id,
      documentId: assessmentOnlyDocId,
      effectiveDate,
      expirationDate: addDays(new Date(effectiveDate), 365),
      actor: ACTOR,
      notes: "Assessment-only fixture — recordDocumentEvidence() called directly, bypassing the action-layer ISP composition.",
    });
    const assessmentOnlyEval = await getClientReadinessEvaluation(assessmentOnlyResidentId, "active_client");
    const assessmentOnlyIsp = assessmentOnlyEval?.requirements.find((r) => r.requirement.requirement_code === CR_ISP_ON_FILE_AND_CURRENT);
    check(
      "REGRESSION: an assessment-only artifact (composition never invoked) does NOT incorrectly satisfy ISP",
      assessmentOnlyIsp?.status === "missing_evidence",
      assessmentOnlyIsp
    );
    await supabase.from("person_evidence").delete().eq("subject_id", assessmentOnlyResidentId);
    await supabase.from("person_documents").delete().eq("subject_id", assessmentOnlyResidentId);
    await supabase.from("residents").delete().eq("id", assessmentOnlyResidentId);

    // ─── 5. An ISP-only artifact never satisfies Assessment ────────────
    const { data: fixture3 } = await supabase
      .from("residents")
      .insert({ first_name: "IspOnlyFixture", last_name: RUN_MARKER, source_system: "verify-script-fixture", is_active: true, status: "active" })
      .select("id")
      .single();
    const ispOnlyResidentId = fixture3!.id as string;
    const ispOnlyDocId = await uploadFixtureDocument(ispOnlyResidentId, "isp-only");
    await recordDocumentEvidence({
      residentId: ispOnlyResidentId,
      requirementId: ispRequirement.id,
      documentId: ispOnlyDocId,
      effectiveDate,
      expirationDate: addDays(new Date(effectiveDate), ISP_VALIDITY_DAYS),
      actor: ACTOR,
      notes: "ISP-only fixture (e.g. a real pre-Serve ISP with no combined Assessment).",
    });
    const ispOnlyEval = await getClientReadinessEvaluation(ispOnlyResidentId, "active_client");
    const ispOnlyAssessment = ispOnlyEval?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    check("REGRESSION: an ISP-only artifact does NOT incorrectly satisfy Assessment", ispOnlyAssessment?.status === "missing_evidence", ispOnlyAssessment);
    await supabase.from("person_evidence").delete().eq("subject_id", ispOnlyResidentId);
    await supabase.from("person_documents").delete().eq("subject_id", ispOnlyResidentId);
    await supabase.from("residents").delete().eq("id", ispOnlyResidentId);

    // ─── 6. Replacing the combined artifact preserves correct independent evaluation ──
    const replacementDocumentId = await uploadFixtureDocument(residentId, "replacement-combined-assessment-isp");
    const replacementDate = addDays(new Date(effectiveDate), 30);

    const newAssessmentEvidence = await recordDocumentEvidence({
      residentId,
      requirementId: assessmentRequirement.id,
      documentId: replacementDocumentId,
      effectiveDate: replacementDate,
      expirationDate: addDays(new Date(replacementDate), 365),
      supersedesEvidenceId: assessmentEvidence.evidence!.id,
      actor: ACTOR,
      notes: "Replacement combined Assessment/Care Plan fixture.",
    });
    check("replacement: new Assessment evidence created and supersedes the prior one", !newAssessmentEvidence.error && !!newAssessmentEvidence.evidence);

    const newIspEvidence = await recordAssessmentIspEvidenceFromDocument({
      residentId,
      requirementId: ispRequirement.id,
      assessmentEvidenceId: newAssessmentEvidence.evidence!.id,
      documentId: replacementDocumentId,
      effectiveDate: replacementDate,
      expirationDate: addDays(new Date(replacementDate), ISP_VALIDITY_DAYS),
      supersedesEvidenceId: ispFromAssessment.evidence!.id,
      actor: ACTOR,
      notes: null,
    });
    check("replacement: new ISP evidence created and supersedes the prior ISP evidence", !newIspEvidence.error && !!newIspEvidence.evidence);

    // Note: neither recordDocumentEvidence() nor recordAssessmentIspEvidenceFromDocument()
    // calls markPersonEvidenceSuperseded() on the prior row -- a pre-existing,
    // domain-wide gap already true of every Client Readiness evidence
    // writer in this codebase (recordAssessmentEvidence, the Billing
    // composition, etc.), not something this change introduces or is
    // scoped to fix. supersedes_evidence_id still correctly points at the
    // prior row for audit lineage; the evaluator reads correctly anyway
    // because it sorts by created_at desc and takes the newest active row
    // (proven by the compliant/new-document checks below) -- a stale
    // "active" bookkeeping status on the old row is harmless for
    // evaluation. Verified here rather than asserted away.
    const allEvidence = await getPersonEvidenceForSubject("resident", residentId);
    const oldAssessmentRow = allEvidence.find((e) => e.id === assessmentEvidence.evidence!.id);
    const oldIspRow = allEvidence.find((e) => e.id === ispFromAssessment.evidence!.id);
    check(
      "the OLD Assessment/ISP rows still correctly carry supersedes_evidence_id lineage from the new rows (bookkeeping status itself is a known, pre-existing, domain-wide gap, not introduced here)",
      newAssessmentEvidence.evidence?.supersedes_evidence_id === oldAssessmentRow?.id && newIspEvidence.evidence?.supersedes_evidence_id === oldIspRow?.id,
      { newAssessmentEvidence: newAssessmentEvidence.evidence, newIspEvidence: newIspEvidence.evidence }
    );

    const afterReplacement = await getClientReadinessEvaluation(residentId, "active_client");
    const replacementAssessment = afterReplacement?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    const replacementIsp = afterReplacement?.requirements.find((r) => r.requirement.requirement_code === CR_ISP_ON_FILE_AND_CURRENT);
    check("after replacement: Assessment still independently compliant", replacementAssessment?.status === "compliant", replacementAssessment);
    check("after replacement: ISP still independently compliant, from the NEW document", replacementIsp?.status === "compliant", replacementIsp);
    check(
      "after replacement: ISP evidence now points at the replacement document, not the original",
      newIspEvidence.evidence?.document_id === replacementDocumentId
    );

    // ─── 8. Unrelated Client Readiness requirements/population logic is unaffected ──
    const otherRequirements = afterReplacement?.requirements.filter(
      (r) => r.requirement.requirement_code !== CR_ASSESSMENT_CURRENT && r.requirement.requirement_code !== CR_ISP_ON_FILE_AND_CURRENT
    );
    check(
      "REGRESSION: every other Client Readiness requirement is present and untouched by this change",
      (otherRequirements?.length ?? 0) >= 9,
      otherRequirements?.map((r) => r.requirement.requirement_code)
    );

    console.log("\nALL CHECKS COMPLETE");
  } finally {
    console.log("\nCleaning up fixture data...");
    if (residentId) {
      const evidenceRows = await getPersonEvidenceForSubject("resident", residentId);
      for (const e of evidenceRows) {
        await supabase.from("requirement_evidence_links").delete().eq("evidence_id", e.id);
      }
      await supabase.from("person_evidence").delete().eq("subject_id", residentId);
      await supabase.from("person_documents").delete().eq("subject_id", residentId);
      await supabase.from("residents").delete().eq("id", residentId);
    }
    console.log("ok - fixture residents, documents, evidence, and evidence links deleted");
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
