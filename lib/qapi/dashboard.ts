// QAPI v0.1's own composition point (2026-08-25, revised 2026-08-25 to move
// Active Improvement Work to the primary body and stop reproducing Audit
// Readiness's per-subject Needs Attention grid) — mirrors
// lib/compliance/auditReadinessDashboard.ts's discipline exactly: this file
// never recomputes requirement/evidence/finding/attention/corrective-action
// logic itself. app/qapi/page.tsx still calls getAuditReadinessDashboardData()
// directly for its Current Quality Context and Current Quality Priorities
// sections — nothing in this file duplicates that. What's genuinely new
// here: (1) folding EPRP's review/improvement items into a QAPI-facing
// shape (Audit Readiness's dashboard doesn't surface these at all), and (2)
// grouping the SAME already-composed corrective-action list
// (getAllOpenCorrectiveActionsComposed(), untouched) into three
// domain-level buckets for display — a pure regrouping of existing data by
// an existing field (subjectType), never a new action model or a second
// corrective-action table.
import { listRecentEmergencyPreparednessReviewFollowUpItems } from "../data/emergencyPreparednessReviews.ts";
import { getRequirementById } from "../data/personRequirements.ts";
import type { ComposedCorrectiveAction } from "../compliance/correctiveActionComposition.ts";
import type { DomainReadinessRollup } from "../compliance/auditReadinessDashboard.ts";
import { allClearMessage, awaitingFirstSubjectMessage } from "../compliance/auditReadinessDisplay.ts";
import type { EmergencyPreparednessReviewItem, QapiDomainId } from "../supabase/types.ts";

export type QapiImprovementWorkKind = "improvement" | "finding_follow_up";

export interface QapiImprovementWorkItem {
  id: string;
  kind: QapiImprovementWorkKind;
  title: string;
  detail: string | null;
  createdBy: string;
  createdAt: string;
}

// Pure — separated from the I/O below so the shape-mapping (title
// fallbacks, which field becomes the headline vs. the detail) is
// unit-testable without a database. Takes an already-resolved requirement
// name rather than a requirement id so this stays pure; the one live
// requirement lookup happens in getEmergencyPreparednessImprovementWork()
// below.
export function toQapiImprovementWorkItem(
  item: EmergencyPreparednessReviewItem,
  requirementName: string | null
): QapiImprovementWorkItem {
  if (item.item_kind === "improvement") {
    return {
      id: item.id,
      kind: "improvement",
      title: item.description?.trim() || "Improvement suggestion",
      detail: item.notes,
      createdBy: item.created_by,
      createdAt: item.created_at,
    };
  }

  return {
    id: item.id,
    kind: "finding_follow_up",
    title: requirementName ? `Follow-up needed: ${requirementName}` : "Follow-up needed",
    detail: item.notes,
    createdBy: item.created_by,
    createdAt: item.created_at,
  };
}

// The one live read this file performs: recent EPRP review items that
// represent open-ended improvement work, each resolved to a display-ready
// shape. Requirement names are looked up per finding-follow-up item — the
// same "small list, live-resolve stored FKs" pattern lib/compliance/
// auditDrillView.ts already uses for audit session items, appropriate here
// since this list is always small (EPRP has 6 requirements total).
export async function getEmergencyPreparednessImprovementWork(): Promise<QapiImprovementWorkItem[]> {
  const items = await listRecentEmergencyPreparednessReviewFollowUpItems();

  return Promise.all(
    items.map(async (item) => {
      const requirement = item.item_kind === "requirement_finding" && item.requirement_id ? await getRequirementById(item.requirement_id) : null;
      return toQapiImprovementWorkItem(item, requirement?.name ?? null);
    })
  );
}

// ─── Active Improvement Work buckets ───────────────────────────────────────
// Groups the already-composed corrective-action list (and, for the
// Emergency Preparedness bucket, the review/improvement items above) into
// three domain-level buckets for display. Pure regrouping — no action is
// re-evaluated, re-prioritized, or re-typed; every field on every returned
// item is exactly what getAllOpenCorrectiveActionsComposed() /
// getEmergencyPreparednessImprovementWork() already produced.

export type QapiImprovementBucketId = "client_care" | "workforce" | "emergency_preparedness";

export interface QapiImprovementBucket {
  id: QapiImprovementBucketId;
  label: string;
  itemCount: number;
  // A short, honest tally of what's inside — e.g. "2 Evidence Missing · 1
  // Needs Review" — never a vague word like "issues." Built from each
  // item's own action_type/kind, not invented.
  summary: string;
  correctiveActions: ComposedCorrectiveAction[];
  reviewNotes: QapiImprovementWorkItem[];
}

const BUCKET_ORDER: ReadonlyArray<{ id: QapiImprovementBucketId; label: string }> = [
  { id: "client_care", label: "Client Care" },
  { id: "workforce", label: "Workforce" },
  { id: "emergency_preparedness", label: "Emergency Preparedness" },
];

// The "Client Care" bucket label (and its subjectType-based grouping) is
// deliberately a different word than the QAPI domain note/readiness id
// "client_readiness" — the bucket groups corrective actions by who they're
// about (client-facing work), while the domain note/readiness rollup is
// named after the Client Readiness product concept. Both refer to the same
// underlying domain, so this is the one explicit place that maps between
// the two vocabularies, rather than either file silently assuming they
// match.
export const QAPI_DOMAIN_ID_FOR_BUCKET: Record<QapiImprovementBucketId, QapiDomainId> = {
  client_care: "client_readiness",
  workforce: "workforce",
  emergency_preparedness: "emergency_preparedness",
};

// Every corrective action already carries a real, always-populated
// subjectType (never null) — the most robust existing discriminator to
// bucket by, robust to action_type/domain being null or inconsistently
// populated at write time.
function bucketIdForSubjectType(subjectType: ComposedCorrectiveAction["subjectType"]): QapiImprovementBucketId {
  if (subjectType === "workforce_member") return "workforce";
  if (subjectType === "resident") return "client_care";
  // 'agency' and 'community' are both organization-level scopes.
  // Emergency Preparedness is currently the only agency-level domain QAPI
  // knows about, and 'community' has no backing table yet (see
  // lib/data/complianceCorrectiveActions.ts's own KNOWN GAP comment) — so
  // both land here provisionally until 'community' becomes a real, distinct
  // subject with its own domain meaning.
  return "emergency_preparedness";
}

const CORRECTIVE_ACTION_TYPE_LABELS: Record<string, string> = {
  evidence_missing: "Evidence Missing",
  evidence_expired: "Evidence Expired",
  evidence_expiring_soon: "Evidence Expiring Soon",
  evidence_requires_review: "Needs Review",
  evidence_awaiting_verification: "Awaiting Verification",
  audit_finding_failed: "Audit Finding",
};

const IMPROVEMENT_WORK_KIND_LABELS: Record<QapiImprovementWorkKind, string> = {
  improvement: "Improvement Note",
  finding_follow_up: "Review Follow-up",
};

function tallyLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "No active items";
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${count} ${label}`)
    .join(" · ");
}

// Pure — takes the two already-fetched lists (exactly what
// getAllOpenCorrectiveActionsComposed()/getEmergencyPreparednessImprovementWork()
// return) and regroups them. Separated from I/O the same way
// composeCorrectiveActions() itself is, so the grouping/summary behavior is
// unit-testable without a database.
export function buildQapiImprovementBuckets(
  correctiveActions: readonly ComposedCorrectiveAction[],
  reviewNotes: readonly QapiImprovementWorkItem[]
): QapiImprovementBucket[] {
  return BUCKET_ORDER.map(({ id, label }) => {
    const actions = correctiveActions.filter((a) => bucketIdForSubjectType(a.subjectType) === id);
    const notes = id === "emergency_preparedness" ? [...reviewNotes] : [];
    const labels = [
      ...actions.map((a) => CORRECTIVE_ACTION_TYPE_LABELS[a.actionType] ?? a.actionType),
      ...notes.map((n) => IMPROVEMENT_WORK_KIND_LABELS[n.kind]),
    ];
    return {
      id,
      label,
      itemCount: actions.length + notes.length,
      summary: tallyLabels(labels),
      correctiveActions: actions,
      reviewNotes: notes,
    };
  });
}

// ─── Current Quality Context / Current Quality Priorities copy ────────────
// Deliberately much simpler than DomainReadinessCard's percent-and-
// requirement-completion breakdown (that stays Audit Readiness's own,
// unchanged) — QAPI's top section states only whether the domain is
// context-ready-to-read, never a detailed compliance figure. Both reuse the
// same DomainReadinessRollup fields Audit Readiness's dashboard already
// computes; neither recomputes readiness.

// One line for the Current Quality Context card — intentionally coarser
// than Audit Readiness's own card: a ready/total count for multi-subject
// domains, a binary Ready/Needs Attention for the single-subject
// (agency-level) case, honest Coming Soon / awaiting-first-subject states
// otherwise. No percentage, no requirement-completion figure.
export function qualityContextSummary(domain: DomainReadinessRollup): string {
  if (!domain.configured) return "Coming Soon";
  if (domain.awaitingFirstSubject) return awaitingFirstSubjectMessage(domain);
  if (domain.subjectCount <= 1) {
    return domain.readySubjectCount === domain.subjectCount ? "Ready" : "Needs Attention";
  }
  return `${domain.readySubjectCount} of ${domain.subjectCount} ready`;
}

// One line for the Current Quality Priorities row — a plain count of open
// issues (domain.issues.length, the same population Audit Readiness's own
// Needs Attention section ranks/groups — reused as a count here, never
// re-derived), never an individual subject/requirement breakdown. Reuses
// allClearMessage() verbatim for the zero-issue case so QAPI and Audit
// Readiness can never disagree about what "all clear" means.
export function qualityPriorityLine(domain: DomainReadinessRollup): string {
  if (!domain.configured) return "Not yet configured.";
  if (domain.awaitingFirstSubject) return "No eligible subjects yet.";
  if (domain.issues.length === 0) return allClearMessage(domain);
  return `${domain.issues.length} item${domain.issues.length === 1 ? "" : "s"} need${domain.issues.length === 1 ? "s" : ""} attention.`;
}
