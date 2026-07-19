// Seeds fictional, obviously-labeled Background Eligibility demonstration
// decisions — proving the one real vertical-slice decision workflow
// end-to-end across the classification space. Calls the shared
// lib/intelligence/decisionEngine/evaluate.ts service directly (NOT the
// Server Action layer), per the corrected layering in
// docs/architecture/decisions/0002-governance-decision-vertical-slice.md:
// getCurrentAuthorizedUser() depends on next/headers' cookies(), which
// throws outside a real request — this script never needs to fake one.
//
// notify: false — fictional demo cases must never trigger a real
// SERVE_NOTIFY_* email.
//
// No real applicant, employee, or background-check data appears here or
// anywhere this script touches — every fixture is drawn from
// sourceAdapters/{viventium,apploi,screeningProvider}.ts's fixture-only
// data, obviously labeled "Governance Demo — Applicant [A–E]".
//
// Usage:
//   npm run seed:governance-demo

import { evaluateDecision } from "../lib/intelligence/decisionEngine/evaluate.ts";
import type { BackgroundEligibilityEvaluationInput } from "../lib/intelligence/domains/compliance/backgroundEligibility/decisionSpec.ts";
import { getScreeningProviderFixtureReport } from "../lib/intelligence/domains/compliance/backgroundEligibility/sourceAdapters/screeningProvider.ts";
import { getApploiFixtureApplicantIdentity } from "../lib/intelligence/domains/compliance/backgroundEligibility/sourceAdapters/apploi.ts";

const FIXTURE_IDS = ["fixture-a", "fixture-b", "fixture-c", "fixture-d", "fixture-e"] as const;

const REVIEW_STATUS_BY_FIXTURE: Record<string, BackgroundEligibilityEvaluationInput["reviewStatus"]> = {
  // fixture-c is Presumptive Disqualification — left pending so the
  // executive_review_required outcome (and its notification event) is
  // actually exercised by this seed run.
  // fixture-d is Reviewable — left pending, decision_pending outcome.
};

async function run() {
  const results: { fixtureId: string; recommendationId?: string; error?: string }[] = [];

  for (const fixtureId of FIXTURE_IDS) {
    const report = getScreeningProviderFixtureReport(fixtureId);
    const applicant = getApploiFixtureApplicantIdentity(fixtureId);
    if (!report || !applicant) {
      results.push({ fixtureId, error: "Missing fixture data" });
      continue;
    }

    const input: BackgroundEligibilityEvaluationInput = {
      subjectType: "prospect",
      subjectId: applicant.externalSubjectId,
      subjectCanonicalTable: null,
      subjectCanonicalId: null,
      reportReceived: report.reportReceived,
      rawOffenses: report.rawOffenses,
      reviewStatus: REVIEW_STATUS_BY_FIXTURE[fixtureId],
      retrieval: {
        externalSubjectId: applicant.externalSubjectId,
        onboardingOrScreeningStatus: report.reportReceived ? "report_received" : "report_not_received",
        evidenceType: "background_check_finding",
        evidenceAvailable: report.reportReceived,
        verifiedAt: report.reportReceived ? new Date().toISOString() : null,
        sourceSystemLink: null,
        retrievalMethod: "fixture_demonstration",
        isAuthoritative: false,
        requiresManualConfirmation: true,
      },
    };

    const result = await evaluateDecision("background_eligibility", input, { notify: false });
    results.push({ fixtureId, ...result });
  }

  console.log("");
  for (const r of results) {
    if (r.error) {
      console.error(`FAIL - ${r.fixtureId}: ${r.error}`);
    } else {
      console.log(`ok - ${r.fixtureId} -> recommendation ${r.recommendationId}`);
    }
  }

  const failures = results.filter((r) => r.error).length;
  console.log("");
  console.log(`${results.length - failures}/${results.length} seeded`);
  if (failures > 0) process.exit(1);
}

run();
