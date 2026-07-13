import { ExternalLink } from "lucide-react";
import type { ServeTodaysScheduleUnavailableReason } from "@/lib/scheduling/types";
import { UNAVAILABLE_SCHEDULE_COPY } from "@/lib/scheduling/format";
import { axisCareRealTimeViewUrl } from "@/lib/workflows/serveWorkflows";

interface ScheduleUnavailableStateProps {
  reason: ServeTodaysScheduleUnavailableReason;
}

// safeMessage from ServeTodaysScheduleResult is intentionally unused for
// display — only the generic, reason-keyed copy in
// lib/scheduling/format.ts's UNAVAILABLE_SCHEDULE_COPY ever renders, so a
// vendor error string can never reach the page even indirectly.
//
// "disabled" gets its own calm, external-launch treatment — it is a Serve
// OS release decision, not a problem, so it deliberately omits the "try
// reloading" suggestion the other (genuinely unavailable) reasons use,
// and never implies credentials are missing or broken.
export function ScheduleUnavailableState({ reason }: ScheduleUnavailableStateProps) {
  const isDisabled = reason === "disabled";

  return (
    <div className="rounded-xl border border-ivory-border bg-surface px-6 py-10 text-center shadow-card">
      <p className="font-serif text-xl text-muted">{UNAVAILABLE_SCHEDULE_COPY[reason]}</p>
      <p className="mt-2 font-sans text-sm text-muted">
        {isDisabled ? (
          "Live schedule visibility is not currently enabled in Serve OS."
        ) : (
          <>
            Try reloading this page in a moment. If the issue continues,
            contact Serve OS support.
          </>
        )}
      </p>
      <div className="mt-5">
        <a
          href={axisCareRealTimeViewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-ivory-border bg-ivory px-4 font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
        >
          Open AxisCare Real Time View
          <ExternalLink size={15} strokeWidth={1.75} />
        </a>
      </div>
      {isDisabled && (
        <p className="mt-3 font-sans text-sm text-muted">
          Make schedule changes and review full visit details in AxisCare.
        </p>
      )}
    </div>
  );
}
