"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startEmergencyPreparednessReviewAction } from "@/lib/actions/emergencyPreparedness";

export function StartReviewButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const res = await startEmergencyPreparednessReviewAction();
      if (res.error || !res.review) {
        setError(res.error ?? "Could not start the review.");
        return;
      }
      router.push(`/audit-readiness/emergency-preparedness/reviews/${res.review.id}`);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleStart}
        disabled={isPending}
        className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Starting…" : "Start Annual Review"}
      </button>
      {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}
    </div>
  );
}
