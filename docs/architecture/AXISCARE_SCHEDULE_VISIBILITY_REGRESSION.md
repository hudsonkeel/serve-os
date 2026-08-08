# AxisCare Schedule Visibility — Regression Investigation

Post-Release Stabilization, AxisCare Operational Synchronization
Workstream 1. Investigation findings.

## Finding: there is no code regression

The read-only AxisCare schedule feature is **fully implemented, complete,
and has been live on `main` since before the Local Serve OS Parity
recovery even began** — introduced in `50895f6` ("feat(workspace): show
live AxisCare schedule with server feature flag"), well before Task A's
Workforce shipment (`d3d0360`). The parity merge (`9d035ac`) did not
touch, omit, or replace any part of it.

The implementation already satisfies every "required behavior" in this
task:

- **`lib/scheduling/types.ts`** — `ServeTodaysScheduleUnavailableReason`
  already distinguishes 8 states: `disabled`, `not_configured`,
  `authentication`, `authorization`, `timeout`, `upstream_unavailable`,
  `invalid_response`, `unknown` — a strict superset of what was asked for
  (loading is a normal Next.js page-level concern; "no visits today" is
  the `available: true` state with an empty `activeVisits` array).
- **`lib/scheduling/todaysSchedule.ts`** — the release-control gate
  (`isAxisCareScheduleEnabled()`) is checked *before* any AxisCare
  credential lookup or request, so a disabled feature and a misconfigured
  one are already deliberately kept indistinguishable from the outside —
  exactly the safeguard this task asked to preserve.
- **`components/scheduling/ScheduleUnavailableState.tsx`** — the exact
  placeholder text quoted in this task's objective
  ("Live schedule visibility is not currently enabled in Serve OS.") is
  the `disabled`-only branch of an already-complete component; every
  other reason renders "Try reloading..." instead, and never implies
  credentials are broken.
- **`components/scheduling/ScheduleVisitRow.tsx`** — already renders
  time range, resident (client), caregiver (or an explicit "Unassigned"
  state), service, status badge, and a verified badge.
- **`components/scheduling/TodaysSchedulePanel.tsx`** — already renders
  an explicit empty state ("No active AxisCare visits are scheduled
  today.") distinct from the disabled state, and a link to AxisCare's
  Real Time View for full schedule operations.
- **`app/workspace/page.tsx`** — already calls `getAxisCareTodaysSchedule()`
  and renders `<TodaysSchedulePanel result={schedule} />`, confirmed
  present and correctly wired after the parity merge.
- **No schedule-editing UI exists anywhere** — confirmed read-only.

## Precise regression cause

**Deployment environment-variable configuration — not a code omission,
not a feature flag Serve OS itself disabled, not a stale fallback, not a
route/component replacement, and not a fetch failure being
mislabeled.** The single release-control switch,
`AXISCARE_SCHEDULE_ENABLED`, is read via an intentional, documented,
exact case-sensitive match (`lib/integrations/axiscare/config.ts` —
the code comment explicitly states this is deliberate: "anything else
(missing, empty, 'false', 'TRUE', '1') is disabled"). This was **not**
loosened by this investigation — it is a considered design decision, not
a bug, and changing it unilaterally would override that decision without
authorization.

## Environment-variable availability (names only — values never disclosed)

| Variable | Local development | Netlify Deploy Preview | Netlify production | Vercel preview |
|---|---|---|---|---|
| `AXISCARE_SCHEDULE_ENABLED` | Present, confirmed correctly formatted | **Unable to verify** — no Netlify dashboard/API access in this environment | **Unable to verify** — same | **Unable to verify** — no Vercel dashboard/API access |
| `AXISCARE_WORKFORCE_ENABLED` (same mechanism, gates the separate Workforce caregiver sync) | Present | Unable to verify | Unable to verify | Unable to verify |

Both variables are already documented in `.env.example` (lines 65 and
74) with explanatory comments — no documentation gap was found either.

## What was and was not done

- **No code was changed.** There is nothing to restore in code.
- **No dashboard configuration was changed**, per this task's explicit
  instruction — this requires a human action in the Netlify (and
  possibly Vercel) environment-variables UI, comparing against the local
  `.env.local` value, which this session cannot perform.
- **This document is the deliverable** for this workstream: a precise,
  evidence-backed regression cause, so the actual fix (setting one
  environment variable in the deploy dashboard) can happen directly
  without further re-investigation.

## Recommended next step (not performed here)

Confirm `AXISCARE_SCHEDULE_ENABLED` is set to exactly `true` in both the
Netlify Deploy Preview context and Netlify's production environment
variables (Site configuration → Environment variables). If AxisCare
credentials (`AXISCARE_API_TOKEN`, `AXISCARE_API_BASE_URL`,
`AXISCARE_SITE_NUMBER`, `AXISCARE_API_VERSION`) are also required and
missing there, the feature will correctly report `not_configured`
instead of `disabled` once the release-control flag itself is set — that
would be the next diagnostic signal to look for.
