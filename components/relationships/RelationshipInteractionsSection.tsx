"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logRelationshipInteraction } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_INTERACTION_PARTICIPANT_ROLES,
  RELATIONSHIP_INTERACTION_PARTICIPANT_ROLE_LABELS,
  RELATIONSHIP_INTERACTION_RESULTS,
  RELATIONSHIP_INTERACTION_RESULT_LABELS,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_TOUCH_TYPE_LABELS,
  RELATIONSHIP_TOUCH_TYPES,
} from "@/lib/relationships/constants";
import { RelationshipInteractionSuggestion, RelationshipTouch, RelationshipTouchType } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelationshipInteractionSuggestionsReview } from "@/components/relationships/RelationshipInteractionSuggestionsReview";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const FIELD_LABEL = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";
export const FIELD_INPUT =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60";

interface ParticipantDraft {
  role: string;
  name: string;
}

interface RelationshipInteractionsSectionProps {
  relationshipId: string;
  interactions: RelationshipTouch[];
  // All suggestions for this relationship, grouped by the Interaction that
  // produced them — used to show a "N pending review" badge and a
  // "Resulting updates" line on each history row.
  suggestionsByInteraction: Record<string, RelationshipInteractionSuggestion[]>;
}

export function RelationshipInteractionsSection({
  relationshipId,
  interactions,
  suggestionsByInteraction,
}: RelationshipInteractionsSectionProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // One key per form session — lets a retried/double-clicked submission
  // return the original Interaction instead of duplicating it. Regenerated
  // whenever the form is reset (after a successful save or on cancel).
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // Quick capture — the required/optional fields are deliberately minimal
  // (type, when, what happened; participants/result/contact/outcome
  // optional). Insights/Commitments/Open Loops are no longer typed in here
  // — Serve OS proposes them afterward from the narrative, for review.
  const [touchType, setTouchType] = useState<RelationshipTouchType>("call");
  const [occurredAt, setOccurredAt] = useState("");
  const [summary, setSummary] = useState("");
  const [interactionResult, setInteractionResult] = useState("");
  const [outcome, setOutcome] = useState("");
  const [contactName, setContactName] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);

  // Follow-Up Needed? — an explicit next action may still be captured
  // directly here as a shortcut; if left blank, the review step may
  // propose one instead.
  const [followUpNeeded, setFollowUpNeeded] = useState<"yes" | "no" | "unsure">("no");
  const [unsureNote, setUnsureNote] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionType, setActionType] = useState<string>(RELATIONSHIP_ACTION_TYPES[0]);
  const [actionDueAt, setActionDueAt] = useState("");
  const [actionAssignedTo, setActionAssignedTo] = useState("");
  const [actionPriority, setActionPriority] = useState(RELATIONSHIP_PRIORITIES[1]);

  // The interaction just saved this session, and the suggestions Serve
  // proposed for it — shown inline immediately, without waiting for the
  // page's server data to refresh. Suggestions for older interactions
  // still come from the suggestionsByInteraction prop.
  const [justLogged, setJustLogged] = useState<{
    interactionId: string;
    suggestions: RelationshipInteractionSuggestion[];
  } | null>(null);
  // Which interaction's suggestion review panel is open, for interactions
  // already in history (reopened via their "N pending review" badge).
  const [openReviewInteractionId, setOpenReviewInteractionId] = useState<string | null>(null);

  function resetForm() {
    setSummary("");
    setOutcome("");
    setContactName("");
    setOccurredAt("");
    setInteractionResult("");
    setParticipants([]);
    setFollowUpNeeded("no");
    setUnsureNote("");
    setActionTitle("");
    setActionDueAt("");
    setActionAssignedTo("");
    setIdempotencyKey(crypto.randomUUID());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const unsureOpenLoop = followUpNeeded === "unsure" && unsureNote.trim() ? [{ question: unsureNote, owner: undefined, targetResolutionDate: undefined }] : [];

    startTransition(async () => {
      const result = await logRelationshipInteraction({
        relationshipId,
        touchType,
        occurredAt: occurredAt || undefined,
        summary,
        interactionResult: interactionResult || undefined,
        outcome,
        contactName,
        participants: participants
          .filter((p) => p.name.trim())
          .map((p) => ({ role: p.role, name: p.name })),
        openLoops: unsureOpenLoop,
        nextAction:
          followUpNeeded === "yes" && actionTitle.trim()
            ? {
                title: actionTitle,
                actionType,
                dueAt: actionDueAt || undefined,
                assignedTo: actionAssignedTo || undefined,
                priority: actionPriority,
              }
            : null,
        idempotencyKey,
      });

      if (result.error) {
        setError(result.error);
        return;
      }
      setIsAdding(false);
      if (result.interactionId) {
        setJustLogged({ interactionId: result.interactionId, suggestions: result.suggestions ?? [] });
      }
      resetForm();
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Recent Interactions
        </h4>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            + Log Interaction
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-sm text-subtle">
        Record what happened once — Serve OS turns it into history, context, and preparation for next time.
      </p>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
          {/* ─── Quick Capture ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={FIELD_LABEL}>Type</span>
              <select
                value={touchType}
                onChange={(e) => setTouchType(e.target.value as RelationshipTouchType)}
                className={FIELD_INPUT}
              >
                {RELATIONSHIP_TOUCH_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_TOUCH_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>When</span>
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className={FIELD_INPUT}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={FIELD_LABEL}>What happened?</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Spoke with Cary about possible recurring visits. She'll check with her sister and call back Thursday. Confirmed the pricing sheet was received. Paste notes, a transcript, or an email here too — Serve will suggest what to remember from it."
              className={`${FIELD_INPUT} placeholder:text-subtle`}
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={FIELD_LABEL}>Result (optional)</span>
              <select
                value={interactionResult}
                onChange={(e) => setInteractionResult(e.target.value)}
                className={FIELD_INPUT}
              >
                <option value="">Select a result...</option>
                {RELATIONSHIP_INTERACTION_RESULTS.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_INTERACTION_RESULT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Primary contact (optional)</span>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className={FIELD_INPUT}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={FIELD_LABEL}>Outcome note (optional)</span>
            <input type="text" value={outcome} onChange={(e) => setOutcome(e.target.value)} className={FIELD_INPUT} />
          </label>

          {/* ─── People involved (repeatable, optional) ────────────────── */}
          <div className="mt-4">
            <span className={FIELD_LABEL}>People involved (optional)</span>
            {participants.map((p, i) => (
              <div key={i} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1fr,auto]">
                <select
                  value={p.role}
                  onChange={(e) =>
                    setParticipants((prev) => prev.map((row, idx) => (idx === i ? { ...row, role: e.target.value } : row)))
                  }
                  className={FIELD_INPUT}
                >
                  {RELATIONSHIP_INTERACTION_PARTICIPANT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {RELATIONSHIP_INTERACTION_PARTICIPANT_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Name"
                  value={p.name}
                  onChange={(e) =>
                    setParticipants((prev) => prev.map((row, idx) => (idx === i ? { ...row, name: e.target.value } : row)))
                  }
                  className={FIELD_INPUT}
                />
                <button
                  type="button"
                  onClick={() => setParticipants((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm text-muted hover:border-navy/20"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setParticipants((prev) => [...prev, { role: "primary_contact", name: "" }])}
              className="mt-2 font-sans text-sm font-medium text-navy hover:text-navy-light"
            >
              + Add participant
            </button>
          </div>

          {/* ─── Follow-Up Needed? ──────────────────────────────────── */}
          <div className="mt-5 border-t border-ivory-border pt-4">
            <span className={FIELD_LABEL}>What should happen next?</span>
            <div className="mt-2 flex gap-4">
              {(["yes", "no", "unsure"] as const).map((value) => (
                <label key={value} className="flex items-center gap-1.5 font-sans text-sm text-body">
                  <input
                    type="radio"
                    name="followUpNeeded"
                    checked={followUpNeeded === value}
                    onChange={() => setFollowUpNeeded(value)}
                  />
                  {value === "yes" ? "I already know" : value === "no" ? "Nothing needed" : "Not sure yet"}
                </label>
              ))}
            </div>

            {followUpNeeded === "yes" && (
              <div className="mt-3 space-y-3 rounded-md border border-ivory-border bg-surface p-3">
                <label className="block">
                  <span className={FIELD_LABEL}>Next action title</span>
                  <input
                    type="text"
                    placeholder="Call Cary Monday"
                    value={actionTitle}
                    onChange={(e) => setActionTitle(e.target.value)}
                    className={`${FIELD_INPUT} placeholder:text-subtle`}
                  />
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select value={actionType} onChange={(e) => setActionType(e.target.value)} className={FIELD_INPUT}>
                    {RELATIONSHIP_ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {RELATIONSHIP_ACTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={actionPriority}
                    onChange={(e) => setActionPriority(e.target.value as (typeof RELATIONSHIP_PRIORITIES)[number])}
                    className={FIELD_INPUT}
                  >
                    {RELATIONSHIP_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {RELATIONSHIP_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="datetime-local"
                    value={actionDueAt}
                    onChange={(e) => setActionDueAt(e.target.value)}
                    className={FIELD_INPUT}
                  />
                  <input
                    type="text"
                    placeholder="Owner (optional)"
                    value={actionAssignedTo}
                    onChange={(e) => setActionAssignedTo(e.target.value)}
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
            )}

            {followUpNeeded === "unsure" && (
              <label className="mt-3 block">
                <span className={FIELD_LABEL}>What&apos;s unresolved? (optional — becomes an open question)</span>
                <input
                  type="text"
                  value={unsureNote}
                  onChange={(e) => setUnsureNote(e.target.value)}
                  className={FIELD_INPUT}
                />
              </label>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save Interaction"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                resetForm();
              }}
              disabled={isPending}
              className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {interactions.length > 0 ? (
        <div className="space-y-3">
          {interactions.map((interaction) => {
            const suggestions =
              justLogged?.interactionId === interaction.id
                ? justLogged.suggestions
                : suggestionsByInteraction[interaction.id] ?? [];
            const pendingCount = suggestions.filter((s) => s.status === "pending").length;
            const approved = suggestions.filter((s) => s.status === "approved");
            const isReviewOpen =
              justLogged?.interactionId === interaction.id || openReviewInteractionId === interaction.id;

            return (
              <div key={interaction.id} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="gold">{RELATIONSHIP_TOUCH_TYPE_LABELS[interaction.touch_type]}</Badge>
                  {interaction.interaction_result && (
                    <Badge tone="blue">{RELATIONSHIP_INTERACTION_RESULT_LABELS[interaction.interaction_result]}</Badge>
                  )}
                  <span className="font-sans text-sm text-muted">{compactDate(interaction.occurred_at)}</span>
                  {pendingCount > 0 && !isReviewOpen && (
                    <button
                      type="button"
                      onClick={() => setOpenReviewInteractionId(interaction.id)}
                      className="rounded-full bg-gold/20 px-2.5 py-0.5 font-sans text-xs font-semibold text-navy hover:bg-gold/30"
                    >
                      {pendingCount} suggestion{pendingCount > 1 ? "s" : ""} to review
                    </button>
                  )}
                  {pendingCount === 0 && suggestions.length > 0 && (
                    <Badge tone="success">Reviewed</Badge>
                  )}
                </div>
                <p className="font-sans text-sm text-body">{interaction.structured_summary ?? interaction.summary}</p>
                {interaction.structured_summary && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-sans text-xs text-subtle">Show full narrative</summary>
                    <p className="mt-1 font-sans text-sm text-muted">{interaction.summary}</p>
                  </details>
                )}
                {interaction.outcome && <p className="mt-1 font-sans text-sm text-muted">Outcome: {interaction.outcome}</p>}
                <p className="mt-1 font-sans text-sm text-subtle">Logged by {interaction.created_by}</p>

                {approved.length > 0 && (
                  <p className="mt-2 font-sans text-xs text-subtle">
                    Resulting updates:{" "}
                    {approved
                      .map((s) => RELATIONSHIP_INTERACTION_SUGGESTION_RESULT_LABEL(s))
                      .join(" · ")}
                  </p>
                )}

                {isReviewOpen && suggestions.length > 0 && (
                  <div className="mt-3 border-t border-ivory-border pt-3">
                    <RelationshipInteractionSuggestionsReview
                      suggestions={suggestions}
                      onChange={(updated) => {
                        if (justLogged?.interactionId === interaction.id) {
                          setJustLogged({ interactionId: interaction.id, suggestions: updated });
                        }
                        router.refresh();
                      }}
                      onDone={() => setOpenReviewInteractionId(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !isAdding && <EmptyState description="No interactions logged yet." />
      )}
    </div>
  );
}

function RELATIONSHIP_INTERACTION_SUGGESTION_RESULT_LABEL(suggestion: RelationshipInteractionSuggestion): string {
  switch (suggestion.resulting_record_table) {
    case "relationship_actions":
      return "Next action created";
    case "relationship_working_notes":
      return "Working note added";
    case "relationship_commitments":
      return "Commitment recorded";
    case "relationship_open_loops":
      return "Open question recorded";
    case "relationship_service_opportunities":
      return "Service opportunity updated";
    case "relationships":
      return "Stage changed";
    case "resident_current_needs":
      return "Resident need updated";
    case "relationship_touches":
      return "Summary updated";
    default:
      return "Updated";
  }
}
