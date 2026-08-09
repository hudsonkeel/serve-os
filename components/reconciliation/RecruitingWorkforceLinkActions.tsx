"use client";

import { useState, useTransition } from "react";
import {
  confirmRecruitingWorkforceLink,
  recordRecruitingWorkforceLinkDecision,
} from "@/lib/actions/recruitingWorkforceLink";
import type { RecruitingResolutionBasis } from "@/lib/recruitingLeads/workforceResolution";

interface RecruitingWorkforceLinkActionsProps {
  recruitingLeadId: string;
  workforceMemberId: string;
  matchBasis: RecruitingResolutionBasis | null;
}

type Mode = "idle" | "confirm" | "reject" | "defer";

const MODE_COPY: Record<Exclude<Mode, "idle">, { prompt: string; confirmLabel: string; successText: string }> = {
  confirm: {
    prompt: "Why are these the same person?",
    confirmLabel: "Confirm: Same Person — Mark Hired",
    successText: "Confirmed — recruiting lead marked Hired and linked to this workforce member.",
  },
  reject: {
    prompt: "Why is this not the same person?",
    confirmLabel: "Confirm: Not the Same Person",
    successText: "Recorded — not the same person.",
  },
  defer: {
    prompt: "Why defer this decision?",
    confirmLabel: "Confirm: Review Later",
    successText: "Deferred for later review.",
  },
};

export function RecruitingWorkforceLinkActions({
  recruitingLeadId,
  workforceMemberId,
  matchBasis,
}: RecruitingWorkforceLinkActionsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function reset() {
    setMode("idle");
    setRationale("");
  }

  function handleSubmit() {
    if (mode === "idle") return;
    if (!rationale.trim()) {
      setMessage({ type: "error", text: "A rationale is required." });
      return;
    }
    setMessage(null);
    const successText = MODE_COPY[mode].successText;
    startTransition(async () => {
      const result =
        mode === "confirm"
          ? await confirmRecruitingWorkforceLink({ recruitingLeadId, workforceMemberId, matchBasis, rationale })
          : await recordRecruitingWorkforceLinkDecision({
              recruitingLeadId,
              workforceMemberId,
              decision: mode === "reject" ? "rejected" : "deferred",
              matchBasis,
              rationale,
            });
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: successText });
        reset();
      }
    });
  }

  return (
    <div className="mt-3 border-t border-ivory-border pt-3">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setMode("confirm")}
            className="rounded-lg bg-success-surface px-3 py-1.5 font-sans text-sm font-medium text-success-text transition-colors hover:opacity-80 disabled:opacity-50"
          >
            Same Person — Mark Hired
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setMode("reject")}
            className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:bg-ivory disabled:opacity-50"
          >
            Not the Same Person
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setMode("defer")}
            className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
          >
            Review Later
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block font-sans text-sm font-medium text-body">{MODE_COPY[mode].prompt}</label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
            placeholder="Rationale (required)"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {MODE_COPY[mode].confirmLabel}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={reset}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className={`mt-2 font-sans text-sm ${message.type === "error" ? "text-danger-text" : "text-success-text"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
