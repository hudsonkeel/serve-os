import type { SourceCapabilityDeclaration } from "../sourceCapability.ts";

// Viventium placeholder adapter. We have NOT confirmed with Viventium
// whether any of the capabilities below are actually exposed through an
// accessible API — every declaration here is "unverified". See
// docs/integrations/VIVENTIUM_APPLOI_PLACEHOLDER_BOUNDARIES.md and
// docs/architecture/governance-phase-1-implementation.md's Phase 2
// integration-discovery list. This file makes no live calls and returns
// only fixture data, used exclusively by the seed/demo script.

export const VIVENTIUM_SOURCE_SYSTEM = "viventium";

export const viventiumCapabilities: readonly SourceCapabilityDeclaration[] = [
  { capability: "employee_identifier", status: "unverified", note: "Not yet confirmed whether Viventium exposes a stable employee identifier via API." },
  { capability: "onboarding_task_completion", status: "unverified", note: "Not yet confirmed whether onboarding-task status is retrievable." },
  { capability: "background_screening_order_status", status: "unverified", note: "Viventium may only surface this via Sapphire, per docs/compliance/regulatory-registry/policy-coverage-matrix.md — not confirmed." },
  { capability: "adjudication_or_finding_status", status: "unverified", note: "Not yet confirmed." },
  { capability: "document_certificate_metadata", status: "unverified", note: "Not yet confirmed whether HR document metadata is queryable." },
  { capability: "report_links_or_external_record_ids", status: "unverified", note: "Not yet confirmed." },
  { capability: "configurable_exports", status: "unverified", note: "Not yet confirmed." },
  { capability: "api_endpoints", status: "unverified", note: "No Viventium API access has been established for this project." },
  { capability: "webhooks_or_change_notifications", status: "unverified", note: "Not yet confirmed." },
  { capability: "access_and_licensing_requirements", status: "unverified", note: "Not yet confirmed with Serve leadership or Viventium." },
];

export interface ViventiumFixtureEmployeeIdentity {
  readonly externalSubjectId: string;
  readonly label: string;
}

const FIXTURES: Record<string, ViventiumFixtureEmployeeIdentity> = {
  "fixture-a": { externalSubjectId: "viventium-fixture-employee-a", label: "Governance Demo — Applicant A (fixture)" },
  "fixture-b": { externalSubjectId: "viventium-fixture-employee-b", label: "Governance Demo — Applicant B (fixture)" },
  "fixture-c": { externalSubjectId: "viventium-fixture-employee-c", label: "Governance Demo — Applicant C (fixture)" },
  "fixture-d": { externalSubjectId: "viventium-fixture-employee-d", label: "Governance Demo — Applicant D (fixture)" },
  "fixture-e": { externalSubjectId: "viventium-fixture-employee-e", label: "Governance Demo — Applicant E (fixture)" },
};

// Fixture-only — never a live call. Returns null for anything not in the
// fixture set, deliberately, rather than fabricating a plausible-looking
// record.
export function getViventiumFixtureEmployeeIdentity(fixtureId: string): ViventiumFixtureEmployeeIdentity | null {
  return FIXTURES[fixtureId] ?? null;
}
