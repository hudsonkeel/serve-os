import type { SourceCapabilityDeclaration } from "../sourceCapability.ts";

// Background-screening-provider placeholder adapter (e.g. Sapphire, per
// docs/compliance/regulatory-registry/policy-coverage-matrix.md — not
// confirmed as the actual provider for this integration). We have NOT
// confirmed what this provider exposes through an accessible API — every
// declaration here is "unverified". Fixture data only, no live calls, no
// real background-check content anywhere in this file.

export const SCREENING_PROVIDER_SOURCE_SYSTEM = "screening_provider";

export const screeningProviderCapabilities: readonly SourceCapabilityDeclaration[] = [
  { capability: "applicant_identifier", status: "unverified", note: "Not yet confirmed which screening provider Serve uses for this project or what identifier it returns." },
  { capability: "onboarding_task_completion", status: "unavailable", note: "Not this provider's concern — onboarding lives in Viventium/Apploi, not the screening provider." },
  { capability: "background_screening_order_status", status: "unverified", note: "Not yet confirmed whether order/turnaround status is API-accessible." },
  { capability: "adjudication_or_finding_status", status: "unverified", note: "The actual finding content this module needs — not yet confirmed as API-accessible; today this is a manual/file-import step (see the usable workflow in docs/architecture/governance-phase-1-implementation.md)." },
  { capability: "document_certificate_metadata", status: "unverified", note: "Not yet confirmed." },
  { capability: "report_links_or_external_record_ids", status: "unverified", note: "Not yet confirmed." },
  { capability: "configurable_exports", status: "unverified", note: "Not yet confirmed." },
  { capability: "api_endpoints", status: "unverified", note: "No screening-provider API access has been established for this project." },
  { capability: "webhooks_or_change_notifications", status: "unverified", note: "Not yet confirmed." },
  { capability: "access_and_licensing_requirements", status: "unverified", note: "Not yet confirmed with Serve leadership or the provider." },
];

// Fictional, obviously-labeled fixture findings — the raw offense text a
// human reviewer would have manually recorded from a (fictional) report.
// Used only by scripts/seed-governance-demo-data.ts. No real applicant or
// background-check data appears anywhere in this file.
export interface ScreeningProviderFixtureReport {
  readonly fixtureId: string;
  readonly reportReceived: boolean;
  readonly rawOffenses: readonly string[];
}

const FIXTURE_REPORTS: Record<string, ScreeningProviderFixtureReport> = {
  "fixture-a": { fixtureId: "fixture-a", reportReceived: true, rawOffenses: [] }, // Eligible: no findings
  "fixture-b": { fixtureId: "fixture-b", reportReceived: true, rawOffenses: ["Aggravated Assault"] }, // Automatic Disqualification
  "fixture-c": { fixtureId: "fixture-c", reportReceived: true, rawOffenses: ["Felony Theft"] }, // Presumptive Disqualification
  "fixture-d": { fixtureId: "fixture-d", reportReceived: true, rawOffenses: ["Simple Possession"] }, // Reviewable
  "fixture-e": { fixtureId: "fixture-e", reportReceived: false, rawOffenses: [] }, // Insufficient evidence: report not yet received
};

export function getScreeningProviderFixtureReport(fixtureId: string): ScreeningProviderFixtureReport | null {
  return FIXTURE_REPORTS[fixtureId] ?? null;
}
