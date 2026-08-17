"use client";

import { useState, useTransition } from "react";
import { restoreAxisCareRecord } from "@/lib/actions/reconciliation";

// Suppression is reversible — this is the one governed way back.
// Restoring always lands the record in 'needs_review', never asserts a
// new classification on the user's behalf.
export function RestoreRecordButton({ axiscareId }: { axiscareId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function handleRestore() {
    setMessage(null);
    startTransition(async () => {
      const result = await restoreAxisCareRecord(axiscareId);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Restored — back in the ordinary review queue." });
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleRestore}
        className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:bg-ivory disabled:opacity-50"
      >
        {isPending ? "Restoring…" : "Restore"}
      </button>
      {message && (
        <p className={`mt-1 font-sans text-sm ${message.type === "error" ? "text-danger-text" : "text-success-text"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
