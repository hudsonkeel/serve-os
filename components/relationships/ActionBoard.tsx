"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeNextAction, dismissNextAction } from "@/lib/actions/relationships";
import { RELATIONSHIP_ATTENTION_LABELS, RelationshipAttentionStatus } from "@/lib/relationships/attention";
import {
  applyBoardFilters,
  DEFAULT_BOARD_FILTERS,
  type BoardFilterState,
} from "@/lib/relationships/boardFilters";
import { RELATIONSHIP_PRIORITY_LABELS, RELATIONSHIP_TYPE_LABELS } from "@/lib/relationships/constants";
import { matchesRelationshipSearch, normalizeSearchQuery } from "@/lib/relationships/search";
import { sortActionBoardRows, type SortableRelationshipRow } from "@/lib/relationships/sorting";
import type { RelationshipBoardRow, RecentlyCompletedAction } from "@/lib/data/relationships";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelationshipFilterBar } from "./RelationshipFilterBar";
import { QuickAddActionForm, QuickEditActionForm, QuickLogTouchForm } from "./RelationshipQuickForms";

export interface ActionBoardRow extends RelationshipBoardRow, SortableRelationshipRow {
  attentionStatus: RelationshipAttentionStatus;
}

export interface RecentlyCompletedWithName extends RecentlyCompletedAction {
  relationshipDisplayName: string;
}

function compactDate(iso: string | null) {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const SECTIONS: { status: RelationshipAttentionStatus; title: string }[] = [
  { status: "overdue", title: "Overdue" },
  { status: "due_today", title: "Due Today" },
  { status: "due_this_week", title: "Due This Week" },
  { status: "no_next_action", title: "No Next Action" },
  { status: "on_hold", title: "Waiting / On Hold" },
];

// ─── One card per relationship ──────────────────────────────────────────

type CardMode = "view" | "edit" | "logTouch" | "addAction";

export interface JustCompletedSnapshot {
  relationshipId: string;
  displayName: string;
  actionTitle: string;
}

function ActionBoardCard({
  row,
  onCompleted,
}: {
  row: ActionBoardRow;
  onCompleted: (snapshot: JustCompletedSnapshot) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<CardMode>("view");
  const [busy, setBusy] = useState<"complete" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const action = row.nearestAction;

  function handleComplete() {
    if (!action) return;
    setError(null);
    setBusy("complete");
    startTransition(async () => {
      const result = await completeNextAction({ actionId: action.id, relationshipId: row.id });
      if (result.error) {
        setError(result.error);
        setBusy(null);
        return;
      }
      // Server Actions invoked inside a transition trigger an implicit
      // Next.js route refresh once they resolve — this card's own local
      // state (and the card itself, if this relationship no longer
      // qualifies for any section) won't survive that refresh. The
      // "what happens next" prompt is therefore tracked one level up, in
      // ActionBoard, using a snapshot captured *before* the refresh
      // reconciles fresh server data.
      onCompleted({ relationshipId: row.id, displayName: row.displayName, actionTitle: action.title });
      setBusy(null);
    });
  }

  function handleDismiss() {
    if (!action) return;
    setError(null);
    setBusy("dismiss");
    startTransition(async () => {
      const result = await dismissNextAction({ actionId: action.id, relationshipId: row.id });
      if (result.error) {
        setError(result.error);
        setBusy(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge tone="gold">{RELATIONSHIP_TYPE_LABELS[row.relationshipType]}</Badge>
        {row.priority !== "normal" && (
          <Badge tone={row.priority === "urgent" ? "danger" : "warning"}>
            {RELATIONSHIP_PRIORITY_LABELS[row.priority]}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Link
          href={`/relationships/${row.id}`}
          className="font-sans text-base font-semibold text-navy hover:text-navy-light"
        >
          {row.displayName}
        </Link>
        {row.residentId && (
          <Link href={`/residents/${row.residentId}`} className="font-sans text-sm text-muted hover:text-body">
            {row.residentName ?? "View resident"}
          </Link>
        )}
      </div>

      <p className="mt-1 font-sans text-sm text-muted">
        Owner {row.ownerLabel ?? "Unassigned"}
        {row.lastMeaningfulTouchAt ? ` · Last touch ${compactDate(row.lastMeaningfulTouchAt)}` : " · No touches logged"}
      </p>

      {row.activeNote && (
        <p className="mt-1.5 font-sans text-sm text-subtle">Note: {truncate(row.activeNote.content, 120)}</p>
      )}

      {action ? (
        <p className="mt-2 font-sans text-sm text-body">
          <span className="font-semibold">{action.title}</span> · Due {compactDate(action.dueAt)}
          {action.assignedTo ? ` · Assigned to ${action.assignedTo}` : ""}
        </p>
      ) : (
        <p className="mt-2 font-sans text-sm text-subtle">No next action.</p>
      )}

      {error && <p className="mt-2 font-sans text-sm text-red-600">{error}</p>}

      {mode === "view" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {action ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={handleComplete}
                className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "complete" && isPending ? "Completing..." : "Complete"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setMode("edit")}
                className="inline-flex h-9 items-center justify-center rounded-md border border-ivory-border bg-surface px-3 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleDismiss}
                className="inline-flex h-9 items-center justify-center rounded-md border border-ivory-border bg-surface px-3 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "dismiss" && isPending ? "Dismissing..." : "Dismiss"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode("addAction")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Add Next Action
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode("logTouch")}
            className="inline-flex h-9 items-center justify-center rounded-md border border-ivory-border bg-surface px-3 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
          >
            {/* Relabeled for consistency with the full Log Interaction
                workflow on the Relationship detail page — still the
                lightweight quick-touch path (log_relationship_touch), not
                upgraded to capture Insights/Commitments/Open Loops here.
                See docs/architecture/decisions/0003-interaction-extends-touch.md. */}
            Log Interaction
          </button>
          <Link
            href={`/relationships/${row.id}`}
            className="font-sans text-sm font-medium text-navy hover:text-navy-light"
          >
            Open Relationship
          </Link>
        </div>
      )}

      {mode === "edit" && action && (
        <QuickEditActionForm relationshipId={row.id} action={action} onDone={() => setMode("view")} />
      )}
      {mode === "logTouch" && (
        <QuickLogTouchForm relationshipId={row.id} onDone={() => setMode("view")} />
      )}
      {mode === "addAction" && (
        <QuickAddActionForm relationshipId={row.id} onDone={() => setMode("view")} />
      )}
    </div>
  );
}

// ─── "What happens next?" prompt after completing an action ────────────
// Rendered by ActionBoard, not ActionBoardCard, specifically so it
// survives the implicit route refresh that follows the completion Server
// Action (see the comment in handleComplete above) — it renders from a
// plain-data snapshot, independent of whether the completed relationship
// still appears in any board section afterward.

function JustCompletedPrompt({
  snapshot,
  onDismiss,
}: {
  snapshot: JustCompletedSnapshot;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [showAddAction, setShowAddAction] = useState(false);

  return (
    <div className="rounded-lg border border-gold/40 bg-gold-subtle/40 px-5 py-4">
      <p className="font-sans text-base font-semibold text-body">{snapshot.displayName}</p>
      <p className="mt-1 font-sans text-sm text-muted">
        &ldquo;{snapshot.actionTitle}&rdquo; completed. What happens next?
      </p>
      {!showAddAction && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddAction(true)}
            className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Add Next Action
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-9 items-center justify-center rounded-md border border-ivory-border bg-surface px-3 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
          >
            No Follow-up Needed
          </button>
          <Link
            href={`/relationships/${snapshot.relationshipId}`}
            className="font-sans text-sm font-medium text-navy hover:text-navy-light"
          >
            Open Relationship
          </Link>
        </div>
      )}
      {showAddAction && (
        <QuickAddActionForm
          relationshipId={snapshot.relationshipId}
          onDone={() => {
            onDismiss();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Recently Completed ──────────────────────────────────────────────────

function RecentlyCompletedSection({ items }: { items: RecentlyCompletedWithName[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Recently Completed
        <span className="ml-2 rounded-full bg-ivory-warm px-2 py-0.5 text-badge font-semibold text-muted">
          {items.length}
        </span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ivory-border bg-surface px-4 py-3"
          >
            <div>
              <Link
                href={`/relationships/${item.relationshipId}`}
                className="font-sans text-sm font-semibold text-navy hover:text-navy-light"
              >
                {item.relationshipDisplayName}
              </Link>
              <p className="font-sans text-sm text-body">{item.title}</p>
              {item.completionOutcome && (
                <p className="font-sans text-sm text-muted">{item.completionOutcome}</p>
              )}
            </div>
            <p className="font-sans text-sm text-subtle">
              {compactDate(item.completedAt)}
              {item.completedBy ? ` · ${item.completedBy}` : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Board ────────────────────────────────────────────────────────────

interface ActionBoardProps {
  rows: ActionBoardRow[];
  recentlyCompleted: RecentlyCompletedWithName[];
}

export function ActionBoard({ rows, recentlyCompleted }: ActionBoardProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<BoardFilterState>(DEFAULT_BOARD_FILTERS);
  const [justCompleted, setJustCompleted] = useState<JustCompletedSnapshot | null>(null);

  const trimmedQuery = normalizeSearchQuery(search);
  const hasActiveSearch = trimmedQuery.length > 0;

  // Closed relationships need nothing from this board (Part 15).
  const eligibleRows = useMemo(() => rows.filter((r) => r.status !== "closed"), [rows]);

  const attentionCounts = useMemo(() => {
    const counts: Partial<Record<RelationshipAttentionStatus, number>> = {};
    for (const row of eligibleRows) counts[row.attentionStatus] = (counts[row.attentionStatus] ?? 0) + 1;
    return counts;
  }, [eligibleRows]);

  const filteredRows = useMemo(() => {
    let result = applyBoardFilters(eligibleRows, filters);
    if (hasActiveSearch) {
      result = result.filter((r) => matchesRelationshipSearch(r, trimmedQuery));
    }
    return result;
  }, [eligibleRows, filters, hasActiveSearch, trimmedQuery]);

  const sectionsWithRows = SECTIONS.map((section) => ({
    ...section,
    rows: sortActionBoardRows(filteredRows.filter((r) => r.attentionStatus === section.status)),
  })).filter((section) => section.rows.length > 0);

  const totalVisible = filteredRows.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by relationship, resident, or contact..."
          aria-label="Search relationships"
          className="h-11 w-full max-w-md rounded-lg border border-ivory-border bg-surface px-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
        />
        <div className="flex flex-wrap items-center gap-2">
          {SECTIONS.map((section) => (
            <span
              key={section.status}
              className="inline-flex items-center gap-2 rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm font-medium text-body"
            >
              {RELATIONSHIP_ATTENTION_LABELS[section.status]}
              <span className="rounded-full bg-ivory-warm px-2 py-0.5 text-label font-semibold leading-none text-muted">
                {attentionCounts[section.status] ?? 0}
              </span>
            </span>
          ))}
        </div>
      </div>

      <RelationshipFilterBar rows={eligibleRows} filters={filters} onChange={setFilters} />

      {justCompleted && (
        <JustCompletedPrompt snapshot={justCompleted} onDismiss={() => setJustCompleted(null)} />
      )}

      {totalVisible === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          description={
            hasActiveSearch || Object.values(filters).some((v) => v !== "all" && v !== DEFAULT_BOARD_FILTERS.ownerLabel)
              ? "No relationships match the current search or filters."
              : "Every relationship is on track — no overdue, due-today, or unassigned follow-ups right now."
          }
        />
      ) : (
        <div className="space-y-8">
          {sectionsWithRows.map((section) => (
            <section key={section.status}>
              <h2 className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-muted">
                {section.title}
                <span className="ml-2 rounded-full bg-ivory-warm px-2 py-0.5 text-badge font-semibold text-muted">
                  {section.rows.length}
                </span>
              </h2>
              <div className="space-y-3">
                {section.rows.map((row) => (
                  <ActionBoardCard key={row.id} row={row} onCompleted={setJustCompleted} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <RecentlyCompletedSection items={recentlyCompleted} />
    </div>
  );
}
