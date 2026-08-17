"use client";

import { useState, useTransition } from "react";
import {
  confirmAxisCareResidentIdentity,
  rejectAxisCareResidentIdentity,
  deferAxisCareResidentIdentity,
  type AxisCareIdentityCandidateInput,
} from "@/lib/actions/reconciliation";

// Governed identity-review actions for one ambiguous AxisCare-to-resident
// match. Every decision is persisted through the existing
// person_vendor_identity_links RPCs (confirm/reject/defer) — actor and
// timestamp are attached server-side by those RPCs themselves; reject/
// defer additionally require a rationale, enforced here and again at the
// database layer.
interface IdentityDecisionActionsProps {
  input: AxisCareIdentityCandidateInput;
}

type Mode = "idle" | "reject" | "defer";

export function IdentityDecisionActions({ input }: IdentityDecisionActionsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function reset() {
    setMode("idle");
    setRationale("");
  }

  function handleConfirm() {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmAxisCareResidentIdentity(input, rationale.trim() || undefined);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({
          type: "success",
          text: result.syncWarning ? `Confirmed — this identity link is now durable. ${result.syncWarning}` : "Confirmed — this identity link is now durable. AxisCare data synced.",
        });
        reset();
      }
    });
  }

  function handleRejectOrDefer(kind: "reject" | "defer") {
    if (!rationale.trim()) {
      setMessage({ type: "error", text: "A rationale is required." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const action = kind === "reject" ? rejectAxisCareResidentIdentity : deferAxisCareResidentIdentity;
      const result = await action(input, rationale.trim());
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({
          type: "success",
          text: kind === "reject" ? "Recorded — not the same person." : "Deferred for later review.",
        });
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
            onClick={handleConfirm}
            className="rounded-lg bg-success-surface px-3 py-1.5 font-sans text-sm font-medium text-success-text transition-colors hover:opacity-80 disabled:opacity-50"
          >
            Confirm Match
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
          <label className="block font-sans text-sm font-medium text-body">
            {mode === "reject" ? "Why is this not the same person?" : "Why defer this decision?"}
          </label>
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
              onClick={() => handleRejectOrDefer(mode)}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {mode === "reject" ? "Confirm: Not the Same Person" : "Confirm: Review Later"}
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
        <p
          role="status"
          className={`mt-2 font-sans text-sm ${message.type === "error" ? "text-danger-text" : "text-success-text"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
