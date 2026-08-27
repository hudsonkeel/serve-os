import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { RELATIONSHIP_ACTION_TYPE_LABELS, RELATIONSHIP_PRIORITY_LABELS } from "@/lib/relationships/constants";
import type { BadgeTone } from "@/components/ui/Badge";
import { RelationshipAction } from "@/lib/supabase/types";

const PRIORITY_TONE: Record<RelationshipAction["priority"], BadgeTone> = {
  low: "neutral",
  normal: "blue",
  high: "warning",
  urgent: "danger",
};

function compactDate(iso: string | null) {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A highlighted preview of the single primary open action — not a second
// place to edit it. Editing, completing, and dismissing all happen in the
// full Next Actions list further down the page; this card exists so the
// current accountable action is visible without scrolling.
export function RelationshipNextActionCard({ action }: { action: RelationshipAction | null }) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h2 className="mb-3 font-serif text-card-title font-light text-body">Next Action</h2>
      {action ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={PRIORITY_TONE[action.priority]}>{RELATIONSHIP_PRIORITY_LABELS[action.priority]}</Badge>
            <Badge tone="neutral">{RELATIONSHIP_ACTION_TYPE_LABELS[action.action_type]}</Badge>
          </div>
          <p className="font-sans text-base text-body">{action.title}</p>
          <p className="mt-1 font-sans text-sm text-muted">
            {compactDate(action.due_at)} · {action.assigned_to || "Unassigned"}
          </p>
          <LinkButton href="#next-actions" size="small" className="mt-2">
            View all actions →
          </LinkButton>
        </div>
      ) : (
        <p className="font-sans text-sm text-muted">No current next action for this relationship.</p>
      )}
    </div>
  );
}
