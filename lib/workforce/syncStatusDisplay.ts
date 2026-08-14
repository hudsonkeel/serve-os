// Pure presentation logic for the "Sync Now" result — turns an
// AxisCareCaregiverSyncSummary into a badge tone + human-readable message,
// so an admin can tell in seconds whether the state is configuration
// (disabled), success, a partial/record-level issue, or a full failure.
// No network/database access here — see axiscareCaregiverSync.ts for the
// actual sync logic this only ever reads the already-computed summary of.
//
// Deliberately returns a plain tone string (not components/ui/Badge's
// BadgeTone type) — lib/ modules in this codebase don't import from
// components/; SyncNowButton.tsx narrows this to the Badge component's
// accepted tones at the render site instead.

export type SyncStatusTone = "neutral" | "success" | "warning" | "danger";

export interface SyncSummaryForDisplay {
  status: "success" | "partial" | "failed" | "disabled";
  recordsReceived: number;
  reviewCandidatesCreated: number;
  errors: Array<{ vendorRecordId: string | null; message: string }>;
}

export interface SyncStatusDisplay {
  tone: SyncStatusTone;
  message: string;
  // A single, already-safe (never a raw vendor payload or secret — see
  // axiscareCaregiverSync.ts's own error-construction discipline) detail
  // line to show under the message for failed/partial results. Null when
  // there's nothing more useful to add (success, disabled).
  detail: string | null;
}

function pluralRecords(count: number): string {
  return count === 1 ? "1 record" : `${count} records`;
}

export function resolveSyncSummaryDisplay(summary: SyncSummaryForDisplay): SyncStatusDisplay {
  switch (summary.status) {
    case "disabled":
      return {
        tone: "neutral",
        message: "AxisCare workforce sync is disabled for this environment.",
        detail: null,
      };

    case "success":
      return {
        tone: "success",
        message: `Sync complete: ${summary.recordsReceived} received, ${summary.reviewCandidatesCreated} new candidates for review, 0 errors.`,
        detail: null,
      };

    case "partial": {
      const firstError = summary.errors[0]?.message ?? null;
      const extra = summary.errors.length > 1 ? ` (+${summary.errors.length - 1} more)` : "";
      return {
        tone: "warning",
        message: `Sync complete with issues: ${summary.recordsReceived} received, ${summary.reviewCandidatesCreated} new candidates, ${pluralRecords(summary.errors.length)} failed.`,
        detail: firstError ? `${firstError}${extra}` : null,
      };
    }

    case "failed": {
      const firstError = summary.errors[0]?.message ?? null;
      const extra = summary.errors.length > 1 ? ` (+${summary.errors.length - 1} more)` : "";
      return {
        tone: "danger",
        message: "AxisCare workforce sync failed. View details or try again.",
        detail: firstError ? `${firstError}${extra}` : null,
      };
    }
  }
}
