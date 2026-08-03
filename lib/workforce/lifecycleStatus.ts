// Derived, source-attributed Workforce lifecycle status — computed
// entirely from the allowlisted AxisCare snapshot already stored on
// person_vendor_identity_links.approved_source_data (see
// lib/workforce/axiscareFieldAllowlist.ts). Pure, deterministic, no I/O.
//
// This is a presentation/derived-status layer only — it never writes back
// to AxisCare-owned facts, and it is not a second editable employment
// status. Serve OS's own "AxisCare Operations" panel keeps showing the raw
// statusActive/statusLabel/terminationDate fields unchanged; this function
// only interprets them into one deterministic label for the roster and
// detail-page UI.
export type WorkforceLifecycleStatus = "active" | "inactive" | "terminated" | "pending_start";

export interface WorkforceLifecycleSourceData {
  statusActive: boolean | null;
  terminationDate: string | null;
  startDate: string | null;
}

export interface WorkforceLifecycleEvaluation {
  status: WorkforceLifecycleStatus;
  explanation: string;
  terminationDate: string | null;
}

// AxisCare dates are plain YYYY-MM-DD with no time component — parsing
// with an explicit local-midnight time avoids the classic UTC-parse /
// local-timezone-display off-by-one-day bug.
function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function formatDateForExplanation(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Precedence, deterministic and always evaluated in this exact order —
// termination always wins, even over a contradictory statusActive=true,
// since AxisCare reporting both is treated as "this record hasn't been
// fully updated yet" rather than grounds to call someone active.
export function evaluateWorkforceLifecycleStatus(
  sourceData: WorkforceLifecycleSourceData | null,
  now: () => Date = () => new Date()
): WorkforceLifecycleEvaluation {
  const terminationDate = sourceData?.terminationDate ?? null;
  if (terminationDate) {
    return {
      status: "terminated",
      explanation: `Terminated because AxisCare reports a termination date of ${formatDateForExplanation(terminationDate)}.`,
      terminationDate,
    };
  }

  if (sourceData?.statusActive === true) {
    return {
      status: "active",
      explanation: "Active because AxisCare reports the caregiver as active.",
      terminationDate: null,
    };
  }

  const startDate = sourceData?.startDate ?? null;
  if (startDate && parseLocalDate(startDate).getTime() > now().getTime()) {
    return {
      status: "pending_start",
      explanation: `Pending start because AxisCare reports a future start date of ${formatDateForExplanation(startDate)}.`,
      terminationDate: null,
    };
  }

  return {
    status: "inactive",
    explanation: sourceData
      ? "Inactive because AxisCare reports the caregiver as inactive and no termination date is present."
      : "Inactive because no AxisCare status is on file.",
    terminationDate: null,
  };
}
