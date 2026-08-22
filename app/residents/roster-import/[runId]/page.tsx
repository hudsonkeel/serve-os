import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { getCommunityRosterImportDetail } from "@/lib/actions/communityRosterImport";
import { RosterAnalyzeTrigger } from "@/components/residentRoster/RosterAnalyzeTrigger";
import { RosterRowReview } from "@/components/residentRoster/RosterRowReview";
import { RosterFinalizeControl } from "@/components/residentRoster/RosterFinalizeControl";
import {
  getResidentDisplayNamesByIds,
  getResidentDisplayNamesWithCommunityByIds,
  type RosterImportRunStatus,
  type RosterSourceRow,
} from "@/lib/data/residentRoster";
import { getCommunityById } from "@/lib/data/communities";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Pass 1 built the read-only preview summary (section 22), built from the
// reused matching engine's classification. Pass 2 adds the interactive
// per-row review below it — Match/Create/Defer/Invalid — driving the
// orchestration layer's one recommendation per row
// (lib/residents/roster/communityRosterReconciliation.ts) to an explicit
// human decision. Commit (batch-applying an entire run's worth of
// decisions and flipping run status) is Pass 3 — every write below
// already lands durably the moment a human decides (mirrors AxisCare
// Reconciliation's own real-time governance discipline), so there is
// nothing left to "apply later" for an individual row once its
// review_state reaches 'committed'/'invalid'/'deferred'.
const CLASSIFICATION_LABELS: Record<string, string> = {
  exact_match: "Already known / linked",
  apartment_change: "Existing resident, apartment changed",
  new_resident: "New residents",
  ambiguous: "Needs review — ambiguous",
  possible_duplicate: "Needs review — duplicate apartment on file",
  possible_match: "Needs review — possible match found",
  contradicted_match: "Needs review — evidence conflicts",
  possible_cross_community_match: "Needs review — possible move from another community",
};

function matchBasisFor(resolutionStatus: string): "roster_tier" | "canonical_signal" | "cross_community" {
  if (resolutionStatus === "possible_cross_community_match") return "cross_community";
  if (resolutionStatus === "exact_match" || resolutionStatus === "apartment_change" || resolutionStatus === "contradicted_match") {
    return "roster_tier";
  }
  return "canonical_signal";
}

const REVIEW_STATE_LABELS: Record<string, string> = {
  committed: "Resolved",
  invalid: "Marked invalid",
  deferred: "Deferred",
};
const REVIEW_STATE_TONES: Record<string, BadgeTone> = {
  committed: "success",
  invalid: "neutral",
  deferred: "warning",
};

function rowDisplayLabel(row: RosterSourceRow): string {
  const raw = row.rawPayload as { displayLabel?: string };
  return raw.displayLabel ?? "Unnamed";
}

function rowRawNames(row: RosterSourceRow): { firstNameRaw: string; lastNameRaw: string } {
  const raw = row.rawPayload as { firstNameRaw?: string; lastNameRaw?: string };
  return { firstNameRaw: raw.firstNameRaw ?? "", lastNameRaw: raw.lastNameRaw ?? "" };
}

const STATUS_LABELS: Record<RosterImportRunStatus, string> = {
  analyzing: "Analyzing",
  pending_review: "Needs Review",
  partially_committed: "Partially Committed",
  committed: "Committed",
  cancelled: "Cancelled",
  failed: "Failed",
  completed: "Completed",
};
const STATUS_TONES: Record<RosterImportRunStatus, BadgeTone> = {
  analyzing: "neutral",
  pending_review: "warning",
  partially_committed: "blue",
  committed: "success",
  cancelled: "neutral",
  failed: "danger",
  completed: "success",
};

export default async function RosterImportDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { run, rows } = await getCommunityRosterImportDetail(runId);
  if (!run) notFound();

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.resolutionStatus] = (counts[row.resolutionStatus] ?? 0) + 1;
  }
  const classificationOrder = [
    "exact_match",
    "apartment_change",
    "possible_match",
    "possible_cross_community_match",
    "contradicted_match",
    "new_resident",
    "ambiguous",
    "possible_duplicate",
  ];

  const reviewableRows = rows.filter((r) => r.reviewState === "pending" || r.reviewState === "deferred");
  const resolvedRows = rows.filter((r) => r.reviewState !== "pending" && r.reviewState !== "deferred");

  const crossCommunityResidentIds = rows.filter((r) => r.resolutionStatus === "possible_cross_community_match").map((r) => r.matchedResidentId);
  const ordinaryResidentIds = rows.filter((r) => r.resolutionStatus !== "possible_cross_community_match").map((r) => r.matchedResidentId);

  const [residentNamesById, crossCommunityNamesById, community] = await Promise.all([
    getResidentDisplayNamesByIds(ordinaryResidentIds.filter((id): id is string => Boolean(id))),
    getResidentDisplayNamesWithCommunityByIds(crossCommunityResidentIds.filter((id): id is string => Boolean(id))),
    run.communityId ? getCommunityById(run.communityId) : Promise.resolve(null),
  ]);
  for (const [id, name] of crossCommunityNamesById) residentNamesById.set(id, name);

  const reviewCounts = {
    committed: rows.filter((r) => r.reviewState === "committed").length,
    invalid: rows.filter((r) => r.reviewState === "invalid").length,
    deferred: rows.filter((r) => r.reviewState === "deferred").length,
    pending: rows.filter((r) => r.reviewState === "pending").length,
  };

  return (
    <PageContainer title="The People We Serve · Roster Import">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">{run.sourceFilename}</h1>
          <p className="mt-1 font-sans text-base text-muted">{run.communityCode}</p>
        </div>
        <Badge tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Badge>
      </div>

      {run.status === "analyzing" && <RosterAnalyzeTrigger runId={run.id} />}

      {run.status === "failed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          This import could not be processed. Try uploading the file again.
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
          <p className="font-sans text-sm font-semibold uppercase tracking-wide text-subtle">
            {run.totalSourceRows ?? rows.length} rows analyzed
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {classificationOrder
              .filter((c) => counts[c])
              .map((c) => (
                <div key={c} className="flex items-center justify-between rounded-lg border border-ivory-border bg-ivory px-4 py-3">
                  <span className="font-sans text-sm text-body">{CLASSIFICATION_LABELS[c] ?? c}</span>
                  <span className="font-sans text-lg font-semibold text-navy">{counts[c]}</span>
                </div>
              ))}
          </div>
          <p className="mt-4 font-sans text-xs text-muted">
            Confirmed matches and created residents below are written immediately — there is no separate commit step for a decision
            already made.
          </p>
        </div>
      )}

      {reviewableRows.length > 0 && run.communityId && community && (() => {
        const communityId = run.communityId;
        const communityName = community.name;
        return (
        <div className="mt-6 space-y-4">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-subtle">Needs Review ({reviewableRows.length})</h2>
          {reviewableRows.map((row) => {
            const { firstNameRaw, lastNameRaw } = rowRawNames(row);
            return (
              <div key={row.id} className="rounded-xl border border-ivory-border bg-surface p-5 shadow-card">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-sans text-base font-semibold text-body">{rowDisplayLabel(row)}</p>
                    <p className="font-sans text-xs text-muted">
                      Row {row.sourceRowNumber} · {row.sourceSheet}
                    </p>
                  </div>
                  <span className="shrink-0 font-sans text-xs font-medium uppercase tracking-wide text-subtle">
                    {CLASSIFICATION_LABELS[row.resolutionStatus] ?? row.resolutionStatus}
                  </span>
                </div>
                <RosterRowReview
                  runId={run.id}
                  communityId={communityId}
                  communityName={communityName}
                  sourceRowId={row.id}
                  sourceRecordId={row.sourceRecordId ?? ""}
                  displayLabel={rowDisplayLabel(row)}
                  firstNameRaw={firstNameRaw}
                  lastNameRaw={lastNameRaw}
                  resolutionStatus={row.resolutionStatus}
                  suggestedResidentId={row.matchedResidentId}
                  suggestedResidentName={row.matchedResidentId ? (residentNamesById.get(row.matchedResidentId) ?? null) : null}
                  matchBasis={matchBasisFor(row.resolutionStatus)}
                  reason={row.reviewNotes}
                />
              </div>
            );
          })}
        </div>
        );
      })()}

      {resolvedRows.length > 0 && (
        <div className="mt-6">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-subtle">Resolved ({resolvedRows.length})</h2>
          <div className="mt-3 space-y-2">
            {resolvedRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border border-ivory-border bg-ivory px-4 py-2.5">
                <div>
                  <p className="font-sans text-sm text-body">{rowDisplayLabel(row)}</p>
                  {row.matchedResidentId && residentNamesById.get(row.matchedResidentId) && (
                    <p className="font-sans text-xs text-muted">→ {residentNamesById.get(row.matchedResidentId)}</p>
                  )}
                </div>
                <Badge tone={REVIEW_STATE_TONES[row.reviewState] ?? "neutral"}>{REVIEW_STATE_LABELS[row.reviewState] ?? row.reviewState}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (run.status === "pending_review" || run.status === "partially_committed") && (
        <div className="mt-6">
          <RosterFinalizeControl
            runId={run.id}
            committedCount={reviewCounts.committed}
            invalidCount={reviewCounts.invalid}
            deferredCount={reviewCounts.deferred}
            pendingCount={reviewCounts.pending}
            canCancel={run.status === "pending_review" && reviewCounts.committed === 0}
          />
        </div>
      )}

      {run.status === "committed" && (
        <p className="mt-6 font-sans text-sm text-muted">
          Finalized{run.finalizedBy ? ` by ${run.finalizedBy}` : ""}
          {run.appliedAt ? ` on ${new Date(run.appliedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}. Every
          row was resolved — nothing remains open for this import.
        </p>
      )}
    </PageContainer>
  );
}
