// AxisCare client -> Serve OS lifecycle mapping. Built from a real,
// read-only sample of 25 live AxisCare client records (Post-Release
// Stabilization, AxisCare Operational Synchronization, Workstream 2,
// Phase A) — not the previously untyped discovery stub's assumptions.
// See docs/architecture/AXISCARE_CLIENT_RECONCILIATION.md for the full
// investigation and dry-run report this mapping was derived from.

export interface AxisCareClientStatus {
  readonly active: boolean;
  readonly label: string;
}

export interface AxisCareClientClass {
  readonly code: string;
  readonly label: string;
}

export type ServeClientLifecycle =
  | "active_client"
  | "inactive_client"
  | "prospect"
  | "needs_review";

// Real class codes observed live. "WAF Signed Agreement / No Visits" is
// AxisCare's own label for AxisCare's "WAF - Active No Visits" code — a
// household that has signed on but has no visits yet, which is Serve's
// operating definition of a prospect (not yet actively receiving
// service), not a former client.
const PROSPECT_CLASS_CODES = new Set(["WAF Prospect", "WAF - Active No Visits"]);

export interface ClientLifecycleInput {
  readonly status: AxisCareClientStatus;
  readonly classes: readonly AxisCareClientClass[];
  readonly hasContactInfo: boolean;
  readonly hasStartDate: boolean;
}

export function classifyAxisCareClientLifecycle(input: ClientLifecycleInput): ServeClientLifecycle {
  if (input.status.active) {
    return "active_client";
  }

  if (input.classes.some((c) => PROSPECT_CLASS_CODES.has(c.code))) {
    return "prospect";
  }

  // Inactive, no prospect class, but real evidence of having actually
  // received service at some point (contact info on file and a start
  // date) — a genuine former client, not a placeholder/test row.
  if (input.hasContactInfo && input.hasStartDate) {
    return "inactive_client";
  }

  // Inactive, no prospect class, and no evidence of ever having actually
  // started service — ambiguous. Could be a legitimate thin record or a
  // synthetic/test AxisCare row (both were observed live — see the audit
  // doc). Never silently guessed.
  return "needs_review";
}
