// Full write-safety preview assembly (Phase 7). Composes the client/responsible-party/ADL
// mapping modules into ONE structured, human-reviewable preview object — the shape
// components/assessment/AxisCareWritePreview.tsx renders. Pure composition, no I/O: callers
// supply already-fetched real data (approved facts, live class/ADL catalogs, identity link
// state, reassessment comparison rows) — this module never calls AxisCare or Supabase itself.
//
// This is the "human-readable preview before every create/update" Phase 7 requires. It does not
// send anything — see clientCandidateMapping.ts's header for the standing read-only-integration
// caveat, still authoritative during this build phase.

import type { ApprovedFactForMapping, ClientCandidate, CreateEligibility } from "./clientCandidateMapping.ts";
import { buildNewClientCandidate, buildUpdateClientCandidate, resolveCreateEligibility, summarizeCandidate } from "./clientCandidateMapping.ts";
import type { ApprovedFactForResponsibleParty, ResponsiblePartyCandidate } from "./responsiblePartyMapping.ts";
import { buildResponsiblePartyCandidate } from "./responsiblePartyMapping.ts";
import type { ApprovedFactForAdlMapping, AdlMappingResult, ConfiguredAdl } from "./adlMapping.ts";
import { mapFactsToAdlCandidates } from "./adlMapping.ts";
import type { AxisCareClientClass } from "./types.ts";
import type { AxisCareIdentityLinkState } from "../../assessmentIntelligence/axiscareReadiness.ts";
import type { ReassessmentComparisonRow } from "../../assessmentIntelligence/reassessmentComparison.ts";
import type { ResidentIdentityForMapping } from "./clientCandidateMapping.ts";

export interface NewClientWritePreview {
  kind: "new_client";
  eligibility: CreateEligibility;
  client: ClientCandidate | null; // null when eligibility.eligible is false — never build a candidate for a blocked create
  clientSummary: ReturnType<typeof summarizeCandidate> | null;
  responsibleParty: ResponsiblePartyCandidate;
  adls: AdlMappingResult[];
}

export interface UpdateClientWritePreview {
  kind: "existing_client_update";
  existingAxisCareClientId: string;
  changeRows: ReassessmentComparisonRow[]; // full comparison, ALL classifications, for display
  approvedChangeRows: ReassessmentComparisonRow[]; // the human-approved subset actually going downstream
  client: ClientCandidate & { existingAxisCareClientId: string };
  responsibleParty: ResponsiblePartyCandidate;
  adls: AdlMappingResult[];
}

export function buildNewClientWritePreview(input: {
  residentIdentity: ResidentIdentityForMapping;
  approvedFacts: ApprovedFactForMapping[] & ApprovedFactForResponsibleParty[] & ApprovedFactForAdlMapping[];
  availableClasses: AxisCareClientClass[];
  configuredAdls: ConfiguredAdl[];
  assessmentDate: string;
  identityLink: AxisCareIdentityLinkState;
}): NewClientWritePreview {
  const eligibility = resolveCreateEligibility(input.identityLink);

  const client = eligibility.eligible
    ? buildNewClientCandidate({
        residentIdentity: input.residentIdentity,
        approvedFacts: input.approvedFacts,
        availableClasses: input.availableClasses,
        assessmentDate: input.assessmentDate,
      })
    : null;

  return {
    kind: "new_client",
    eligibility,
    client,
    clientSummary: client ? summarizeCandidate(client) : null,
    responsibleParty: buildResponsiblePartyCandidate(input.approvedFacts),
    adls: mapFactsToAdlCandidates(input.approvedFacts, input.configuredAdls),
  };
}

export function buildUpdateClientWritePreview(input: {
  existingAxisCareClientId: string;
  allChangeRows: ReassessmentComparisonRow[];
  /** Field paths a human reviewer has explicitly approved for this downstream update — anything
   * not listed here, even if classified CHANGED_FACT/NEW_FACT, is excluded from the PATCH
   * candidate. This is the enforcement point for "only approved changed fields go downstream." */
  approvedFieldPaths: Set<string>;
  approvedFactsForResponsiblePartyAndAdls: ApprovedFactForResponsibleParty[] & ApprovedFactForAdlMapping[];
  configuredAdls: ConfiguredAdl[];
}): UpdateClientWritePreview {
  const approvedChangeRows = input.allChangeRows.filter(
    (r) => (r.classification === "CHANGED_FACT" || r.classification === "NEW_FACT") && input.approvedFieldPaths.has(r.fieldPath)
  );

  return {
    kind: "existing_client_update",
    existingAxisCareClientId: input.existingAxisCareClientId,
    changeRows: input.allChangeRows,
    approvedChangeRows,
    client: buildUpdateClientCandidate(input.existingAxisCareClientId, approvedChangeRows),
    responsibleParty: buildResponsiblePartyCandidate(input.approvedFactsForResponsiblePartyAndAdls),
    adls: mapFactsToAdlCandidates(input.approvedFactsForResponsiblePartyAndAdls, input.configuredAdls),
  };
}
