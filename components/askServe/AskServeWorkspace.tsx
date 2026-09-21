"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { askServeQuestion, type AskServeQuestionResult } from "@/lib/actions/askServe";
import type { AskServeCitation, SupportStatus } from "@/lib/askServe/answer/types";
import type { KnowledgeSourceType } from "@/lib/askServe/knowledge/types";
import { AskServeSupportBadge } from "./AskServeSupportBadge";
import { AskServeCitationCard } from "./AskServeCitationCard";
import { SOURCE_TYPE_LABELS } from "./askServeLabels";

const SUGGESTED_QUESTIONS = [
  "How often do we reassess a client?",
  "What can a caregiver do when assisting with medications?",
  "When is a supervisory visit required?",
  "What happens if a caregiver cannot cover a shift?",
  "What are our emergency preparedness requirements?",
  "Does Serve accept physician orders?",
];

// Display order for grouped sources — matches the priority a reader
// should check: Serve's own policy first, then the regulatory baseline,
// then supplementary/draft material.
const SOURCE_GROUP_ORDER: KnowledgeSourceType[] = ["serve_pnp", "texas_pas", "texas_statute_cross_reference", "serve_controlled_procedure"];

function groupCitations(citations: AskServeCitation[]): { sourceType: KnowledgeSourceType; items: AskServeCitation[] }[] {
  return SOURCE_GROUP_ORDER.map((sourceType) => ({
    sourceType,
    items: citations.filter((c) => c.sourceType === sourceType),
  })).filter((group) => group.items.length > 0);
}

function statusHeading(status: SupportStatus): string {
  switch (status) {
    case "not_found":
      return "No answer found";
    default:
      return "Serve Answer";
  }
}

export function AskServeWorkspace() {
  const [question, setQuestion] = useState("");
  const [lastAskedQuestion, setLastAskedQuestion] = useState<string | null>(null);
  const [result, setResult] = useState<AskServeQuestionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Every submission — from the top input, a suggested question, or the
  // bottom input — is a brand-new standalone question. Only the question
  // text itself is sent; no prior question, answer, or evidence is ever
  // passed along. This is a UX convenience (not scrolling back to a
  // "reset" link), not conversational memory: askServeQuestion() below
  // takes exactly one argument, the new question text, same as always.
  function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLastAskedQuestion(trimmed);
    startTransition(async () => {
      const res = await askServeQuestion(trimmed);
      setResult(res);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  function handleSuggestion(prompt: string) {
    setQuestion(prompt);
    ask(prompt);
  }

  function handleRetry() {
    if (lastAskedQuestion) ask(lastAskedQuestion);
  }

  // Brings the newest loading/error/answer state into view — relevant
  // when the question came from the bottom input, where the user is
  // scrolled past the top of the page. Deliberately simple: scroll the
  // same target on every result change, whichever input triggered it.
  useEffect(() => {
    if ((isPending || result) && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isPending, result]);

  const answer = result?.answer;
  const groupedCitations = answer ? groupCitations(answer.citations) : [];

  // Shared by the top input and the post-answer bottom input (Refinement
  // 1) — one input implementation, same validation/submission path
  // (handleSubmit -> ask() -> askServeQuestion()), never duplicated
  // business logic. The only difference between the two placements is
  // the placeholder copy.
  function renderQuestionForm(placeholder: string) {
    return (
      <form onSubmit={handleSubmit} className="rounded-xl border border-ivory-border bg-surface p-1.5 shadow-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <Sparkles size={16} strokeWidth={1.5} className="shrink-0 text-gold/60" />
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent font-sans text-sm text-body outline-none placeholder:text-muted"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || question.trim().length === 0}
            className="shrink-0 rounded-lg bg-navy px-4 py-2 font-sans text-xs font-medium text-white transition-opacity disabled:opacity-40"
          >
            {isPending ? "Asking…" : "Ask"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy">
            <Sparkles size={24} strokeWidth={1.5} className="text-gold" />
          </div>
        </div>
        <h1 className="font-serif text-4xl font-light text-body">Ask Serve</h1>
        <p className="mt-3 font-sans text-sm text-body">
          Ask an operational question and get an answer grounded in Serve&rsquo;s policies &amp; procedures and
          Texas PAS regulatory requirements — with the source evidence behind every answer.
        </p>
      </div>

      {/* Input */}
      <div className="mb-6">{renderQuestionForm("Ask a question about Serve policy or Texas PAS requirements…")}</div>

      <div ref={resultRef}>
      {/* Loading */}
      {isPending && (
        <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border border-ivory-border bg-surface px-5 py-6 text-muted">
          <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
          <span className="font-sans text-sm">Checking Serve policy and Texas PAS sources…</span>
        </div>
      )}

      {/* Error state */}
      {!isPending && result?.error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="font-sans text-sm text-red-700">{result.error}</p>
              {lastAskedQuestion && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-2 font-sans text-xs font-medium text-red-700 underline underline-offset-2"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Answer state */}
      {!isPending && answer && (
        <div className="mb-8 space-y-5">
          <div className="rounded-xl border border-ivory-border bg-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                {statusHeading(answer.supportStatus)}
              </p>
              <AskServeSupportBadge status={answer.supportStatus} />
            </div>
            <p className="whitespace-pre-line font-sans text-base leading-relaxed text-body">{answer.answer}</p>

            {answer.operationalGuidance && (
              <div className="mt-4 border-t border-ivory-border pt-4">
                <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">What to do</p>
                <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-body">{answer.operationalGuidance}</p>
              </div>
            )}

            {answer.importantNote && (
              <div className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
                <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-gold-dark">
                  Important note
                </p>
                <p className="font-sans text-sm leading-relaxed text-body">{answer.importantNote}</p>
              </div>
            )}
          </div>

          {groupedCitations.length > 0 && (
            <div>
              <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">Sources</p>
              <div className="space-y-4">
                {groupedCitations.map((group) => (
                  <div key={group.sourceType}>
                    <p className="mb-2 font-sans text-xs font-medium text-subtle">{SOURCE_TYPE_LABELS[group.sourceType]}</p>
                    <div className="space-y-2">
                      {group.items.map((citation) => (
                        <AskServeCitationCard key={citation.evidenceId} citation={citation} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Suggested prompts — shown until an answer/error is on screen, so the
          workspace doesn't feel cluttered once someone is mid-conversation. */}
      {!isPending && !result && (
        <div>
          <p className="mb-4 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">Suggested Questions</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTED_QUESTIONS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSuggestion(prompt)}
                className="rounded-lg border border-ivory-border bg-surface px-4 py-3 text-left font-sans text-sm text-body shadow-sm transition-colors hover:border-gold/40 hover:bg-gold/5"
              >
                <span className="mr-2 text-gold/60">→</span>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom query input — a standalone, standard Ask Serve submission
          (see renderQuestionForm's own header comment), not a follow-up:
          every submission from here goes through the exact same ask() ->
          askServeQuestion() path as the top input, with no prior question,
          answer, or evidence carried along. Shown once a result (answer
          or error) is on screen, so the natural next action after reading
          an answer and its sources is typing the next question, not
          scrolling back to the top or clicking a reset link. */}
      {!isPending && result && (
        <div className="mt-6">{renderQuestionForm("Ask another Serve question…")}</div>
      )}
    </div>
  );
}
