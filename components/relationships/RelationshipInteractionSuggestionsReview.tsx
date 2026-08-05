"use client";

import { useState, useTransition } from "react";
import { approveInteractionSuggestion, dismissInteractionSuggestion } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPES,
  RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS,
  RELATIONSHIP_INTERACTION_SUGGESTION_TYPE_LABELS,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_WORKING_NOTE_CATEGORIES,
  RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS,
} from "@/lib/relationships/constants";
import { RelationshipInteractionSuggestion } from "@/lib/supabase/types";
import { FIELD_INPUT } from "@/components/relationships/RelationshipInteractionsSection";
import { Badge } from "@/components/ui/Badge";

interface RelationshipInteractionSuggestionsReviewProps {
  suggestions: RelationshipInteractionSuggestion[];
  onChange: (updated: RelationshipInteractionSuggestion[]) => void;
  onDone?: () => void;
}

// What Serve is proposing to remember or act on from a just-logged
// Interaction. Every card traces back to the narrative (see `rationale`)
// and nothing here is written anywhere until the user approves it.
export function RelationshipInteractionSuggestionsReview({
  suggestions,
  onChange,
  onDone,
}: RelationshipInteractionSuggestionsReviewProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const pending = suggestions.filter((s) => s.status === "pending");
  const resolved = suggestions.filter((s) => s.status !== "pending");

  function startEdit(suggestion: RelationshipInteractionSuggestion) {
    setEditingId(suggestion.id);
    setDraft({ ...suggestion.payload });
  }

  function applyUpdate(updated: RelationshipInteractionSuggestion) {
    onChange(suggestions.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleApprove(suggestion: RelationshipInteractionSuggestion, editedPayload?: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const result = await approveInteractionSuggestion({ suggestionId: suggestion.id, editedPayload });
      if (result.error || !result.suggestion) {
        setError(result.error ?? "Could not approve this suggestion.");
        return;
      }
      applyUpdate(result.suggestion);
      setEditingId(null);
    });
  }

  function handleDismiss(suggestion: RelationshipInteractionSuggestion) {
    setError(null);
    startTransition(async () => {
      const result = await dismissInteractionSuggestion({ suggestionId: suggestion.id });
      if (result.error || !result.suggestion) {
        setError(result.error ?? "Could not dismiss this suggestion.");
        return;
      }
      applyUpdate(result.suggestion);
      if (editingId === suggestion.id) setEditingId(null);
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Suggested updates
        </span>
        {onDone && pending.length === 0 && (
          <button type="button" onClick={onDone} className="font-sans text-sm text-muted hover:text-body">
            Close
          </button>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="font-sans text-sm text-subtle">Nothing left to review here.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((suggestion) => (
            <div key={suggestion.id} className="rounded-md border border-ivory-border bg-surface p-3">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone="blue">{RELATIONSHIP_INTERACTION_SUGGESTION_TYPE_LABELS[suggestion.suggestion_type]}</Badge>
              </div>
              {suggestion.rationale && (
                <p className="mb-2 font-sans text-xs text-subtle">{suggestion.rationale}</p>
              )}

              {editingId === suggestion.id ? (
                <SuggestionEditor suggestion={suggestion} draft={draft} setDraft={setDraft} />
              ) : (
                <SuggestionPreview suggestion={suggestion} />
              )}

              <div className="mt-3 flex items-center gap-2">
                {editingId === suggestion.id ? (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleApprove(suggestion, draft)}
                      className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save & Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="font-sans text-sm text-muted hover:text-body"
                    >
                      Cancel edit
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleApprove(suggestion)}
                      className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => startEdit(suggestion)}
                      className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body hover:border-navy/20"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDismiss(suggestion)}
                      className="font-sans text-sm text-muted hover:text-body"
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <p className="mt-3 font-sans text-xs text-subtle">
          {resolved.filter((s) => s.status === "approved").length} approved,{" "}
          {resolved.filter((s) => s.status === "dismissed").length} dismissed.
        </p>
      )}
    </div>
  );
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function SuggestionPreview({ suggestion }: { suggestion: RelationshipInteractionSuggestion }) {
  const p = suggestion.payload;
  switch (suggestion.suggestion_type) {
    case "summary":
      return <p className="font-sans text-sm text-body">{textOf(p.text)}</p>;
    case "commitment":
      return (
        <p className="font-sans text-sm text-body">
          {textOf(p.description)}{" "}
          <span className="text-subtle">
            ({RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS[p.responsiblePartyType as keyof typeof RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS] ?? textOf(p.responsiblePartyType)})
          </span>
        </p>
      );
    case "open_loop":
      return <p className="font-sans text-sm text-body">{textOf(p.question)}</p>;
    case "next_action":
      return <p className="font-sans text-sm text-body">{textOf(p.title)}</p>;
    case "working_note":
      return <p className="font-sans text-sm text-body">{textOf(p.content)}</p>;
    case "service_opportunity":
      return <p className="font-sans text-sm text-body">{textOf(p.serviceSummary)}</p>;
    case "stage_change":
      return (
        <p className="font-sans text-sm text-body">
          Move to {RELATIONSHIP_STAGE_LABELS[p.toStage as keyof typeof RELATIONSHIP_STAGE_LABELS] ?? textOf(p.toStage)}
        </p>
      );
    case "resident_need":
      return <p className="font-sans text-sm text-body">{textOf(p.sentence)}</p>;
    default:
      return null;
  }
}

interface SuggestionEditorProps {
  suggestion: RelationshipInteractionSuggestion;
  draft: Record<string, unknown>;
  setDraft: (value: Record<string, unknown>) => void;
}

function SuggestionEditor({ suggestion, draft, setDraft }: SuggestionEditorProps) {
  function set(field: string, value: string) {
    setDraft({ ...draft, [field]: value });
  }

  switch (suggestion.suggestion_type) {
    case "summary":
      return (
        <textarea
          value={textOf(draft.text)}
          onChange={(e) => set("text", e.target.value)}
          rows={2}
          className={FIELD_INPUT}
        />
      );
    case "commitment":
      return (
        <div className="space-y-2">
          <textarea
            value={textOf(draft.description)}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            className={FIELD_INPUT}
          />
          <select
            value={textOf(draft.responsiblePartyType)}
            onChange={(e) => set("responsiblePartyType", e.target.value)}
            className={FIELD_INPUT}
          >
            {RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      );
    case "open_loop":
      return (
        <textarea
          value={textOf(draft.question)}
          onChange={(e) => set("question", e.target.value)}
          rows={2}
          className={FIELD_INPUT}
        />
      );
    case "next_action":
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={textOf(draft.title)}
            onChange={(e) => set("title", e.target.value)}
            className={FIELD_INPUT}
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={textOf(draft.actionType)} onChange={(e) => set("actionType", e.target.value)} className={FIELD_INPUT}>
              {RELATIONSHIP_ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RELATIONSHIP_ACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select value={textOf(draft.priority)} onChange={(e) => set("priority", e.target.value)} className={FIELD_INPUT}>
              {RELATIONSHIP_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {RELATIONSHIP_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    case "working_note":
      return (
        <div className="space-y-2">
          <textarea
            value={textOf(draft.content)}
            onChange={(e) => set("content", e.target.value)}
            rows={3}
            className={FIELD_INPUT}
          />
          <select value={textOf(draft.category)} onChange={(e) => set("category", e.target.value)} className={FIELD_INPUT}>
            {RELATIONSHIP_WORKING_NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      );
    case "service_opportunity":
      return (
        <input
          type="text"
          value={textOf(draft.serviceSummary)}
          onChange={(e) => set("serviceSummary", e.target.value)}
          className={FIELD_INPUT}
        />
      );
    case "stage_change":
      return (
        <select value={textOf(draft.toStage)} onChange={(e) => set("toStage", e.target.value)} className={FIELD_INPUT}>
          {RELATIONSHIP_STAGES.map((s) => (
            <option key={s} value={s}>
              {RELATIONSHIP_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      );
    case "resident_need":
      return (
        <textarea
          value={textOf(draft.sentence)}
          onChange={(e) => set("sentence", e.target.value)}
          rows={2}
          className={FIELD_INPUT}
        />
      );
    default:
      return null;
  }
}
