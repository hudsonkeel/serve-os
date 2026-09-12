"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { markCorrectiveActionImplementedAction } from "@/lib/actions/correctiveActions";

// Incident Corrective Action Lifecycle v0.1 — IMPLEMENTED means the
// corrective intervention has been put in place; it does not mean the
// action has been proven effective (that's the separate effectiveness
// review, when required). No note required — implementation is a factual,
// single-click state change, actor + timestamp captured automatically by
// the RPC. Domain-agnostic (compliance_corrective_actions is shared across
// QAPI domains) — lives in components/compliance/, not components/incidents/,
// so Infection Lifecycle v0.1 and beyond can reuse it unchanged.
export function MarkCorrectiveActionImplementedButton({ actionId }: { actionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await markCorrectiveActionImplementedAction({ actionId });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Button type="button" size="small" variant="primary" onClick={handleClick} disabled={isPending}>
        {isPending ? "Saving…" : "Mark Implemented"}
      </Button>
      {error && <p className="mt-1 font-sans text-xs text-red-600">{error}</p>}
    </div>
  );
}
