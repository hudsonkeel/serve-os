// Workforce Intelligence's Domain Interpretation of the shared Compliance
// Status layer — see lib/compliance/requirementSetStatus.ts. This file
// knows about "registry evidence" and the WORKFORCE_REGISTRY_EVIDENCE
// requirement set; it does not recompute status from raw evidence itself.
import { evaluateRequirementSetStatus, type RequirementSetEvaluation } from "../compliance/requirementSetStatus.ts";
import { getRequirementSetWithRequirements } from "../data/personRequirements.ts";
import { getPersonEvidenceForSubject } from "../data/personEvidence.ts";
import { SUBJECT_TYPE_WORKFORCE_MEMBER } from "../supabase/types.ts";

export const WORKFORCE_REGISTRY_EVIDENCE_SET_CODE = "WORKFORCE_REGISTRY_EVIDENCE";

export async function getRegistryReadinessForWorkforceMember(
  workforceMemberId: string
): Promise<RequirementSetEvaluation> {
  const [set, evidence] = await Promise.all([
    getRequirementSetWithRequirements(WORKFORCE_REGISTRY_EVIDENCE_SET_CODE),
    getPersonEvidenceForSubject(SUBJECT_TYPE_WORKFORCE_MEMBER, workforceMemberId),
  ]);

  const requirements = set?.requirements ?? [];
  return evaluateRequirementSetStatus(requirements, evidence);
}
