import type { SourceCapabilityDeclaration } from "../sourceCapability.ts";

// Apploi placeholder adapter. We have NOT confirmed with Apploi whether any
// of the capabilities below are actually exposed through an accessible
// API — every declaration here is "unverified". See
// docs/integrations/VIVENTIUM_APPLOI_PLACEHOLDER_BOUNDARIES.md. Fixture
// data only, no live calls.

export const APPLOI_SOURCE_SYSTEM = "apploi";

export const apploiCapabilities: readonly SourceCapabilityDeclaration[] = [
  { capability: "applicant_identifier", status: "unverified", note: "Not yet confirmed whether Apploi exposes a stable applicant identifier via API." },
  { capability: "application_status", status: "unverified", note: "Not yet confirmed." },
  { capability: "recruiting_workflow_status", status: "unverified", note: "Not yet confirmed." },
  { capability: "background_screening_order_status", status: "unverified", note: "Not yet confirmed whether Apploi's flow surfaces screening-order status distinct from Viventium/Sapphire." },
  { capability: "adjudication_or_finding_status", status: "unverified", note: "Not yet confirmed." },
  { capability: "document_certificate_metadata", status: "unverified", note: "Not yet confirmed whether pre-hire document metadata is queryable." },
  { capability: "report_links_or_external_record_ids", status: "unverified", note: "Not yet confirmed." },
  { capability: "configurable_exports", status: "unverified", note: "Not yet confirmed." },
  { capability: "api_endpoints", status: "unverified", note: "No Apploi API access has been established for this project." },
  { capability: "webhooks_or_change_notifications", status: "unverified", note: "Not yet confirmed." },
  { capability: "access_and_licensing_requirements", status: "unverified", note: "Not yet confirmed with Serve leadership or Apploi." },
];

export interface ApploiFixtureApplicantIdentity {
  readonly externalSubjectId: string;
  readonly label: string;
}

const FIXTURES: Record<string, ApploiFixtureApplicantIdentity> = {
  "fixture-a": { externalSubjectId: "apploi-fixture-applicant-a", label: "Governance Demo — Applicant A (fixture)" },
  "fixture-b": { externalSubjectId: "apploi-fixture-applicant-b", label: "Governance Demo — Applicant B (fixture)" },
  "fixture-c": { externalSubjectId: "apploi-fixture-applicant-c", label: "Governance Demo — Applicant C (fixture)" },
  "fixture-d": { externalSubjectId: "apploi-fixture-applicant-d", label: "Governance Demo — Applicant D (fixture)" },
  "fixture-e": { externalSubjectId: "apploi-fixture-applicant-e", label: "Governance Demo — Applicant E (fixture)" },
};

export function getApploiFixtureApplicantIdentity(fixtureId: string): ApploiFixtureApplicantIdentity | null {
  return FIXTURES[fixtureId] ?? null;
}
