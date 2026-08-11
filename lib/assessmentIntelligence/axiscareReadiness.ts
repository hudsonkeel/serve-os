// AxisCare readiness / payload preview — reuses the EXISTING governed identity-resolution
// mechanism (person_vendor_identity_links, subject_type='resident') rather than inventing a
// parallel one. No write path exists here or anywhere this module touches — AxisCare's
// integration remains structurally read-only (lib/integrations/axiscare/client.ts hardcodes
// GET). This module only computes what a proposed CREATE/UPDATE payload would look like, and
// whether it's safe to even propose one. See docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §7/§8.

import { requiredForOperationalizationFields } from "./domainRegistry.ts";
import type { AssertionState } from "./factTypes.ts";

export interface ApprovedFactForReadiness {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
}

export interface AxisCareIdentityLinkState {
  status: "proposed" | "confirmed" | "rejected" | "deferred" | null;
  axiscareClientId: string | null;
  matchConfidence: "high" | "medium" | "low" | null;
}

export type AxisCareReadinessResult =
  | {
      readiness: "ready_to_propose_create";
      missingRequiredFields: never[];
      proposedAction: "create";
    }
  | {
      readiness: "ready_to_propose_update";
      missingRequiredFields: never[];
      proposedAction: "update";
      existingAxisCareClientId: string;
    }
  | {
      readiness: "missing_required_fields";
      missingRequiredFields: string[];
      proposedAction: null;
    }
  | {
      readiness: "possible_duplicate_requires_reconciliation";
      missingRequiredFields: never[];
      proposedAction: null;
    };

export function computeAxisCareReadiness(
  approvedFacts: ApprovedFactForReadiness[],
  identityLink: AxisCareIdentityLinkState
): AxisCareReadinessResult {
  const required = requiredForOperationalizationFields();
  const confirmedFieldPaths = new Set(
    approvedFacts
      .filter((f) => f.assertionState === "confirmed_yes" || f.assertionState === "confirmed_no")
      .map((f) => f.fieldPath)
  );
  const missingRequiredFields = required
    .map((f) => f.fieldPath)
    .filter((fp) => !confirmedFieldPaths.has(fp));

  if (missingRequiredFields.length > 0) {
    return { readiness: "missing_required_fields", missingRequiredFields: missingRequiredFields as never[], proposedAction: null };
  }

  // A "candidate"/"needs_identity_review" match is exactly the ambiguous case — route to
  // Reconciliation, never resolve it here. Only a genuinely absent link or a fully confirmed
  // one are safe to act on automatically.
  if (identityLink.status === "proposed" && identityLink.matchConfidence !== "high") {
    return { readiness: "possible_duplicate_requires_reconciliation", missingRequiredFields: [], proposedAction: null };
  }

  if (identityLink.status === "confirmed" && identityLink.axiscareClientId) {
    return {
      readiness: "ready_to_propose_update",
      missingRequiredFields: [],
      proposedAction: "update",
      existingAxisCareClientId: identityLink.axiscareClientId,
    };
  }

  if (!identityLink.status || identityLink.status === "deferred") {
    return { readiness: "ready_to_propose_create", missingRequiredFields: [], proposedAction: "create" };
  }

  // rejected, or a proposed-but-high-confidence link with no confirmed id yet — still requires
  // a human decision before anything is proposed.
  return { readiness: "possible_duplicate_requires_reconciliation", missingRequiredFields: [], proposedAction: null };
}

export interface AxisCarePayloadPreview {
  action: "create" | "update";
  fields: Record<string, unknown>;
}

/** Builds the preview payload only — never sent anywhere. Fields map 1:1 from approved facts. */
export function buildAxisCarePayloadPreview(
  approvedFacts: ApprovedFactForReadiness[],
  action: "create" | "update"
): AxisCarePayloadPreview {
  const fields: Record<string, unknown> = {};
  for (const fact of approvedFacts) {
    if (fact.assertionState === "confirmed_yes" || fact.assertionState === "confirmed_no") {
      fields[fact.fieldPath] = fact.value;
    }
  }
  return { action, fields };
}
