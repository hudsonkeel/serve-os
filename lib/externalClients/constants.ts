import type { ExternalClientStatus } from "@/lib/supabase/types";

// Controlled-value lists for External Clients. See
// docs/design/RELATIONSHIPS.md, "External Clients."

export const EXTERNAL_CLIENT_STATUSES: readonly ExternalClientStatus[] = [
  "active",
  "on_hold",
  "former",
];

export const EXTERNAL_CLIENT_STATUS_LABELS: Record<ExternalClientStatus, string> = {
  active: "Active",
  on_hold: "On Hold",
  former: "Former Client",
};

export function isValidExternalClientStatus(value: string): value is ExternalClientStatus {
  return (EXTERNAL_CLIENT_STATUSES as readonly string[]).includes(value);
}

export const OPEN_ACTION_DISPOSITIONS = ["complete", "dismiss", "keep_open"] as const;
export type OpenActionDisposition = (typeof OPEN_ACTION_DISPOSITIONS)[number];

export const OPEN_ACTION_DISPOSITION_LABELS: Record<OpenActionDisposition, string> = {
  complete: "Complete open actions",
  dismiss: "Dismiss open actions",
  keep_open: "Keep open actions as-is",
};

export function isValidOpenActionDisposition(value: string): value is OpenActionDisposition {
  return (OPEN_ACTION_DISPOSITIONS as readonly string[]).includes(value);
}
