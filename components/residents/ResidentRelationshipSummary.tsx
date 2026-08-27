import { LinkButton } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { QuickNoteButton } from "@/components/residents/QuickNoteButton";
import { RELATIONSHIP_ACTION_TYPE_LABELS, RELATIONSHIP_PRIORITY_LABELS } from "@/lib/relationships/constants";
import type { Relationship, RelationshipAction, ResidentWorkingNote } from "@/lib/supabase/types";

// Section B — one compact Relationship/CRM summary, replacing what were
// three separate bordered cards (a Relationship card, a standalone
// RelationshipNextActionCard, and a Recent Note card) with one section
// carrying the same underlying data. Every field here already existed
// (Relationship.owner_label, last_meaningful_touch_at, RelationshipAction,
// resident-level working notes) — this only changes how densely they're
// presented.

const PRIORITY_TONE: Record<RelationshipAction["priority"], BadgeTone> = {
  low: "neutral",
  normal: "blue",
  high: "warning",
  urgent: "danger",
};

function compactDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ResidentRelationshipSummaryProps {
  residentId: string;
  residentDisplayName: string;
  relationship: Relationship | null;
  nextAction: RelationshipAction | null;
  recentNote: ResidentWorkingNote | null;
}

export function ResidentRelationshipSummary({
  residentId,
  residentDisplayName,
  relationship,
  nextAction,
  recentNote,
}: ResidentRelationshipSummaryProps) {
  // No relationship at all — the page renders StartRelationshipCard's own
  // compact "Start Relationship" trigger in this section's place instead
  // of an empty panel here (see app/residents/[id]/page.tsx).
  if (!relationship) return null;

  const lastContact = compactDate(relationship.last_meaningful_touch_at);

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">{relationship.stage.replace(/_/g, " ")}</Badge>
          {relationship.priority !== "normal" && <Badge tone={PRIORITY_TONE[relationship.priority]}>{relationship.priority}</Badge>}
          <span className="font-sans text-sm text-muted">Owner: {relationship.owner_label || "Unassigned"}</span>
          <span className="font-sans text-sm text-subtle">·</span>
          <span className="font-sans text-sm text-muted">
            {lastContact ? `Last contact ${lastContact}` : "No contact recorded yet"}
          </span>
        </div>
        <LinkButton href={`/relationships/${relationship.id}`} size="small">
          Full record →
        </LinkButton>
      </div>

      <div className="mt-3 border-t border-ivory-border pt-3">
        {nextAction ? (
          <p className="font-sans text-sm text-body">
            <Badge tone={PRIORITY_TONE[nextAction.priority]}>{RELATIONSHIP_PRIORITY_LABELS[nextAction.priority]}</Badge>{" "}
            <span className="font-medium">{nextAction.title}</span>{" "}
            <span className="text-muted">
              ({RELATIONSHIP_ACTION_TYPE_LABELS[nextAction.action_type]}
              {nextAction.due_at ? ` · due ${compactDate(nextAction.due_at)}` : ""})
            </span>
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <p className="font-sans text-sm text-muted">No follow-up scheduled.</p>
            <LinkButton href={`/relationships/${relationship.id}#next-actions`} size="small">
              Add follow-up
            </LinkButton>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-4 border-t border-ivory-border pt-3">
        <p className="min-w-0 font-sans text-sm text-body">
          {recentNote ? recentNote.content : <span className="text-muted">No recent notes.</span>}
        </p>
        <QuickNoteButton residentId={residentId} residentDisplayName={residentDisplayName} />
      </div>
    </div>
  );
}
