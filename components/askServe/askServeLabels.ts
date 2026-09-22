import type { KnowledgeOperationalAuthority, KnowledgeSourceStatus, KnowledgeSourceType } from "@/lib/askServe/knowledge/types";

// Human-readable labels for what would otherwise be raw internal enum
// values — Kris should never see "serve_pnp" or "pending_not_binding"
// verbatim in the UI.

export const SOURCE_TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  serve_pnp: "Serve Policy & Procedures",
  texas_pas: "Texas PAS Regulation",
  texas_statute_cross_reference: "Texas Statute (Referenced)",
  serve_controlled_procedure: "Serve Controlled Procedure",
};

export const OPERATIONAL_AUTHORITY_LABELS: Record<KnowledgeOperationalAuthority, string> = {
  current_operating_policy: "Current Serve operating policy",
  binding_regulation: "Binding Texas regulation",
  supplementary_reference: "Supplementary reference",
  pending_not_binding: "Draft — pending approval, not binding",
};

export const SOURCE_STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  current: "Current",
  draft_pending_review: "Draft / pending review",
  superseded: "Superseded",
};

export function isDraftOrNotBinding(operationalAuthority: KnowledgeOperationalAuthority): boolean {
  return operationalAuthority === "pending_not_binding";
}
