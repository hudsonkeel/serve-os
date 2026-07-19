"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logRelationshipInteraction } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPES,
  RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS,
  RELATIONSHIP_INSIGHT_CATEGORIES,
  RELATIONSHIP_INSIGHT_CATEGORY_LABELS,
  RELATIONSHIP_INTERACTION_PARTICIPANT_ROLES,
  RELATIONSHIP_INTERACTION_PARTICIPANT_ROLE_LABELS,
  RELATIONSHIP_INTERACTION_RESULTS,
  RELATIONSHIP_INTERACTION_RESULT_LABELS,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_TOUCH_TYPE_LABELS,
  RELATIONSHIP_TOUCH_TYPES,
} from "@/lib/relationships/constants";
import { RelationshipTouch, RelationshipTouchType } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const FIELD_LABEL = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";
const FIELD_INPUT =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60";

interface ParticipantDraft {
  role: string;
  name: string;
}

interface InsightDraft {
  content: string;
  category: string;
  whyItMatters: string;
}

interface CommitmentDraft {
  description: string;
  responsiblePartyType: string;
  responsiblePartyReference: string;
  expectedDate: string;
}

interface OpenLoopDraft {
  question: string;
  owner: string;
  targetResolutionDate: string;
}

interface RelationshipInteractionsSectionProps {
  relationshipId: string;
  interactions: RelationshipTouch[];
}

export function RelationshipInteractionsSection({
  relationshipId,
  interactions,
}: RelationshipInteractionsSectionProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // One key per form session — lets a retried/double-clicked submission
  // return the original Interaction instead of duplicating it. Regenerated
  // whenever the form is reset (after a successful save or on cancel).
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // Quick capture
  const [touchType, setTouchType] = useState<RelationshipTouchType>("call");
  const [occurredAt, setOccurredAt] = useState("");
  const [summary, setSummary] = useState("");
  const [interactionResult, setInteractionResult] = useState("");
  const [outcome, setOutcome] = useState("");
  const [contactName, setContactName] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);

  // Add Relationship Context (progressive disclosure)
  const [insights, setInsights] = useState<InsightDraft[]>([]);
  const [commitments, setCommitments] = useState<CommitmentDraft[]>([]);
  const [openLoops, setOpenLoops] = useState<OpenLoopDraft[]>([]);

  // Follow-Up Needed?
  const [followUpNeeded, setFollowUpNeeded] = useState<"yes" | "no" | "unsure">("no");
  const [unsureNote, setUnsureNote] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionType, setActionType] = useState<string>(RELATIONSHIP_ACTION_TYPES[0]);
  const [actionDueAt, setActionDueAt] = useState("");
  const [actionAssignedTo, setActionAssignedTo] = useState("");
  const [actionPriority, setActionPriority] = useState(RELATIONSHIP_PRIORITIES[1]);

  function resetForm() {
    setSummary("");
    setOutcome("");
    setContactName("");
    setOccurredAt("");
    setInteractionResult("");
    setParticipants([]);
    setInsights([]);
    setCommitments([]);
    setOpenLoops([]);
    setFollowUpNeeded("no");
    setUnsureNote("");
    setActionTitle("");
    setActionDueAt("");
    setActionAssignedTo("");
    setShowContext(false);
    setIdempotencyKey(crypto.randomUUID());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const openLoopsToSubmit = openLoops.filter((o) => o.question.trim());
    if (followUpNeeded === "unsure" && unsureNote.trim()) {
      openLoopsToSubmit.push({ question: unsureNote, owner: "", targetResolutionDate: "" });
    }

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
        insights: insights
          .filter((i) => i.content.trim())
          .map((i) => ({ content: i.content, category: i.category, whyItMatters: i.whyItMatters || undefined })),
        commitments: commitments
          .filter((c) => c.description.trim())
          .map((c) => ({
            description: c.description,
            responsiblePartyType: c.responsiblePartyType,
            responsiblePartyReference: c.responsiblePartyReference || undefined,
            expectedDate: c.expectedDate || undefined,
          })),
        openLoops: openLoopsToSubmit.map((o) => ({
          question: o.question,
          owner: o.owner || undefined,
          targetResolutionDate: o.targetResolutionDate || undefined,
        })),
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
            <span className={FIELD_LABEL}>What happened</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Spoke with Cary about possible recurring visits. Confirmed the pricing sheet was received."
              className={`${FIELD_INPUT} placeholder:text-subtle`}
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={FIELD_LABEL}>Result</span>
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

          {/* ─── People involved (repeatable, part of quick capture) ─── */}
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

          {/* ─── Add Relationship Context (progressive disclosure) ────── */}
          <div className="mt-5 border-t border-ivory-border pt-4">
            <button
              type="button"
              onClick={() => setShowContext((v) => !v)}
              className="font-sans text-sm font-semibold text-navy hover:text-navy-light"
            >
              {showContext ? "− Hide" : "+ Add"} Relationship Context
            </button>

            {showContext && (
              <div className="mt-3 space-y-5">
                {/* Insights */}
                <div>
                  <span className={FIELD_LABEL}>What did we learn?</span>
                  {insights.map((insight, i) => (
                    <div key={i} className="mt-2 space-y-2 rounded-md border border-ivory-border bg-surface p-3">
                      <textarea
                        value={insight.content}
                        onChange={(e) =>
                          setInsights((prev) =>
                            prev.map((row, idx) => (idx === i ? { ...row, content: e.target.value } : row)),
                          )
                        }
                        rows={2}
                        placeholder="Family plans to discuss options this weekend."
                        className={`${FIELD_INPUT} placeholder:text-subtle`}
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select
                          value={insight.category}
                          onChange={(e) =>
                            setInsights((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, category: e.target.value } : row)),
                            )
                          }
                          className={FIELD_INPUT}
                        >
                          {RELATIONSHIP_INSIGHT_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {RELATIONSHIP_INSIGHT_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Why it matters (optional)"
                          value={insight.whyItMatters}
                          onChange={(e) =>
                            setInsights((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, whyItMatters: e.target.value } : row)),
                            )
                          }
                          className={FIELD_INPUT}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setInsights((prev) => prev.filter((_, idx) => idx !== i))}
                        className="font-sans text-sm text-muted hover:text-body"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setInsights((prev) => [...prev, { content: "", category: RELATIONSHIP_INSIGHT_CATEGORIES[0], whyItMatters: "" }])
                    }
                    className="mt-2 font-sans text-sm font-medium text-navy hover:text-navy-light"
                  >
                    + Add insight
                  </button>
                </div>

                {/* Commitments */}
                <div>
                  <span className={FIELD_LABEL}>Commitments</span>
                  {commitments.map((c, i) => (
                    <div key={i} className="mt-2 space-y-2 rounded-md border border-ivory-border bg-surface p-3">
                      <input
                        type="text"
                        placeholder="Serve will send pricing."
                        value={c.description}
                        onChange={(e) =>
                          setCommitments((prev) =>
                            prev.map((row, idx) => (idx === i ? { ...row, description: e.target.value } : row)),
                          )
                        }
                        className={`${FIELD_INPUT} placeholder:text-subtle`}
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <select
                          value={c.responsiblePartyType}
                          onChange={(e) =>
                            setCommitments((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, responsiblePartyType: e.target.value } : row)),
                            )
                          }
                          className={FIELD_INPUT}
                        >
                          {RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Who, specifically (optional)"
                          value={c.responsiblePartyReference}
                          onChange={(e) =>
                            setCommitments((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, responsiblePartyReference: e.target.value } : row)),
                            )
                          }
                          className={FIELD_INPUT}
                        />
                        <input
                          type="date"
                          value={c.expectedDate}
                          onChange={(e) =>
                            setCommitments((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, expectedDate: e.target.value } : row)),
                            )
                          }
                          className={FIELD_INPUT}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCommitments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="font-sans text-sm text-muted hover:text-body"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setCommitments((prev) => [
                        ...prev,
                        { description: "", responsiblePartyType: RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPES[0], responsiblePartyReference: "", expectedDate: "" },
                      ])
                    }
                    className="mt-2 font-sans text-sm font-medium text-navy hover:text-navy-light"
                  >
                    + Add commitment
                  </button>
                </div>

                {/* Open Loops */}
                <div>
                  <span className={FIELD_LABEL}>Open questions</span>
                  {openLoops.map((o, i) => (
                    <div key={i} className="mt-2 space-y-2 rounded-md border border-ivory-border bg-surface p-3">
                      <input
                        type="text"
                        placeholder="Confirm pricing was received."
                        value={o.question}
                        onChange={(e) =>
                          setOpenLoops((prev) => prev.map((row, idx) => (idx === i ? { ...row, question: e.target.value } : row)))
                        }
                        className={`${FIELD_INPUT} placeholder:text-subtle`}
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          placeholder="Owner (optional)"
                          value={o.owner}
                          onChange={(e) =>
                            setOpenLoops((prev) => prev.map((row, idx) => (idx === i ? { ...row, owner: e.target.value } : row)))
                          }
                          className={FIELD_INPUT}
                        />
                        <input
                          type="date"
                          value={o.targetResolutionDate}
                          onChange={(e) =>
                            setOpenLoops((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, targetResolutionDate: e.target.value } : row)),
                            )
                          }
                          className={FIELD_INPUT}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenLoops((prev) => prev.filter((_, idx) => idx !== i))}
                        className="font-sans text-sm text-muted hover:text-body"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOpenLoops((prev) => [...prev, { question: "", owner: "", targetResolutionDate: "" }])}
                    className="mt-2 font-sans text-sm font-medium text-navy hover:text-navy-light"
                  >
                    + Add open question
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── Follow-Up Needed? ──────────────────────────────────── */}
          <div className="mt-5 border-t border-ivory-border pt-4">
            <span className={FIELD_LABEL}>Follow-up needed?</span>
            <div className="mt-2 flex gap-4">
              {(["yes", "no", "unsure"] as const).map((value) => (
                <label key={value} className="flex items-center gap-1.5 font-sans text-sm text-body">
                  <input
                    type="radio"
                    name="followUpNeeded"
                    checked={followUpNeeded === value}
                    onChange={() => setFollowUpNeeded(value)}
                  />
                  {value === "yes" ? "Yes" : value === "no" ? "No" : "Unsure"}
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
                <span className={FIELD_LABEL}>What&apos;s unresolved? (optional — becomes an Open Loop)</span>
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
          {interactions.map((interaction) => (
            <div key={interaction.id} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="gold">{RELATIONSHIP_TOUCH_TYPE_LABELS[interaction.touch_type]}</Badge>
                {interaction.interaction_result && (
                  <Badge tone="blue">{RELATIONSHIP_INTERACTION_RESULT_LABELS[interaction.interaction_result]}</Badge>
                )}
                <span className="font-sans text-sm text-muted">{compactDate(interaction.occurred_at)}</span>
              </div>
              <p className="font-sans text-sm text-body">{interaction.summary}</p>
              {interaction.outcome && <p className="mt-1 font-sans text-sm text-muted">Outcome: {interaction.outcome}</p>}
              <p className="mt-1 font-sans text-sm text-subtle">Logged by {interaction.created_by}</p>
            </div>
          ))}
        </div>
      ) : (
        !isAdding && <EmptyState description="No interactions logged yet." />
      )}
    </div>
  );
}
