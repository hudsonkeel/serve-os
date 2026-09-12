"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { addCorrectiveActionUpdateAction } from "@/lib/actions/correctiveActions";
import { groupEventsByDay } from "@/lib/utils/timelineGrouping";
import type { CorrectiveActionUpdate } from "@/lib/supabase/types";

function eventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Incident Corrective Action Lifecycle v0.1 — append-only follow-up
// activity for one corrective action. Reuses the same day-grouped,
// newest-first timeline pattern as WorkforceActivityTimeline/
// ResidentTimeline/RelationshipTimelineSection (groupEventsByDay), the
// established Serve OS convention for this exact shape of record. There is
// no edit/delete affordance anywhere in this component — the DB itself
// rejects any UPDATE/DELETE on corrective_action_updates, so this
// component doesn't need to pretend otherwise. Domain-agnostic — lives in
// components/compliance/ so any QAPI domain sourcing rows into
// compliance_corrective_actions reuses it unchanged.
export function CorrectiveActionUpdatesTimeline({
  correctiveActionId,
  updates,
  canAddUpdate,
}: {
  correctiveActionId: string;
  updates: CorrectiveActionUpdate[];
  canAddUpdate: boolean;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const dayGroups = groupEventsByDay(
    [...updates].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    (update) => update.created_at
  );

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!body.trim()) {
      setError("Update text is required.");
      return;
    }

    startTransition(async () => {
      const res = await addCorrectiveActionUpdateAction({ correctiveActionId, body: body.trim() });
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      setIsAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-ivory-border pt-3">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Follow-Up Activity</p>
      {canAddUpdate && !isAdding && (
        <div className="mt-2">
          <Button type="button" size="small" onClick={() => setIsAdding(true)}>
            + Add Update
          </Button>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleSubmit} className="mt-2 space-y-2">
          <AutoGrowTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minRows={2}
            placeholder="Add a note about progress, evidence, or activity related to this action."
            autoFocus
          />
          {error && <p className="font-sans text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="small" variant="primary" disabled={isPending}>
              {isPending ? "Saving…" : "Save Update"}
            </Button>
            <Button
              type="button"
              size="small"
              disabled={isPending}
              onClick={() => {
                setIsAdding(false);
                setBody("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {dayGroups.length > 0 ? (
        <div className="mt-3 space-y-3">
          {dayGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-subtle">{group.label}</p>
              <ul className="space-y-2">
                {group.events.map((update) => (
                  <li key={update.id} className="border-l-2 border-ivory-border pl-3">
                    <p className="whitespace-pre-wrap font-sans text-sm text-body">{update.body}</p>
                    <p className="mt-0.5 font-sans text-xs text-subtle">
                      {update.created_by} · {eventTime(update.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        !isAdding && <p className="mt-2 font-sans text-xs text-muted">No follow-up activity yet.</p>
      )}
    </div>
  );
}
