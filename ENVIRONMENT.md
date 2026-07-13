Environment updates

Added

NEXT_PUBLIC_CINCH_CCM_URL

NEXT_PUBLIC_AXISCARE_URL

NEXT_PUBLIC_APPLOI_URL

NEXT_PUBLIC_VIVENTIUM_URL

NEXT_PUBLIC_DIALPAD_URL

NEXT_PUBLIC_GMAIL_URL

NEXT_PUBLIC_SERVE_INTAKE_URL

Updated

SERVE_APP_URL

https://os-servecaregiving.netlify.app

Hostname corrected

servercaregiving

↓

servecaregiving

## Required Environment Variables

SUPABASE_URL

SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY

SERVE_NOTIFICATION_FROM

SERVE_NOTIFICATION_REPLY_TO

SERVE_NOTIFY_WEBSITE_INTAKE

SERVE_SUPPORTED_ZIPS (optional)

Current production website does not yet require all variables because production still uses native Netlify Forms.

## Serve Website

Added production environment variables for:

- Supabase
- Resend
- Notification recipients
- Serve App URL

Website infrastructure now mirrors Serve OS environment configuration where appropriate.

## Development Environment

New active branches

serve-website

- feature/conversational-get-started
- feature/progressive-homepage-intake

serve-os

- feature/professional-referral-admin-display

Netlify Deploy Previews available for homepage UX evaluation.

## 2026-07-06

### Environment Status

No infrastructure, deployment, or environment changes were made today.

Current operational ecosystem remains:

- Serve OS
- Serve Website
- Serve Intake
- Supabase
- Netlify
- Cinch CCM
- AxisCare
- Viventium
- Dialpad
- Google Workspace

## 2026-07-13 — Current Environment Variables (authoritative)

This section supersedes the variable lists above for `serve-os` — checked
directly against `.env.example` and every `process.env` reference in the
codebase as of this date. Older entries above are preserved as history,
not deleted; some (e.g. `SUPABASE_URL` without a `NEXT_PUBLIC_` prefix)
no longer match current code and should not be used as a reference.

**No real credential values appear anywhere in this document — every
example below is a placeholder or a genuinely public, non-secret URL.**

### Supabase

| Variable | Purpose | Exposure | Required | Scope | Example | If absent |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Browser-exposed | Required | All | `https://xxxxx.supabase.co` | App cannot reach Supabase; auth and data reads fail |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public API key | Browser-exposed | Required | All | `eyJ...` (JWT-shaped) | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Elevated Supabase key for server-only operations | **Server-only** | Required | All | `eyJ...` (JWT-shaped) | Server actions requiring elevated access fail |

### Resend (email notifications)

| Variable | Purpose | Exposure | Required | Scope | Example | If absent |
|---|---|---|---|---|---|---|
| `RESEND_API_KEY` | Resend API key for transactional email | Server-only | Required for notifications | All | `re_xxx...` | Notification sends fail; recruiting/prospect email alerts silently do not go out unless the caller handles the error |
| `SERVE_NOTIFICATION_FROM` | From-address for outbound email | Server-only | Optional (has default) | All | `"Serve OS <alerts@servecaregiving.com>"` | Falls back to the hardcoded default |
| `SERVE_NOTIFICATION_REPLY_TO` | Reply-To address | Server-only | Optional | All | `ops@servecaregiving.com` | No Reply-To header sent |
| `SERVE_APP_URL` | Base URL used to build "View in Serve OS →" links inside emails | Server-only | Optional (has default) | All | `https://os-servecaregiving.netlify.app` | Falls back to the hardcoded default — **verify this default against the actual deploy target; see the Vercel/Netlify discrepancy noted in `ARCHITECTURE.md`** |
| `SERVE_NOTIFY_RECRUITING` | Comma-separated recipients for caregiver recruiting leads | Server-only | Optional | All | `ops@servecaregiving.com,recruiting@servecaregiving.com` | No one is notified of new caregiver leads |
| `SERVE_NOTIFY_LEADERSHIP` | Comma-separated recipients for Managing Director leads | Server-only | Optional | All | `leadership@servecaregiving.com` | No one is notified of new MD leads |
| `SERVE_NOTIFY_CARE_PROSPECTS` | Comma-separated recipients for care prospect submissions | Server-only | Optional | All | `intake@servecaregiving.com` | No effect today — these notification rules are typed but not yet wired |

### Apploi

| Variable | Purpose | Exposure | Required | Scope | Example | If absent |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_APPLOI_CAREGIVER_URL` | Caregiver application redirect URL | Browser-exposed | Optional | All | `https://hire.apploi.com/...` | The Apploi redirect button does not appear |

### Serve Workflow Links (Workspace external launch cards)

All optional; each has a hardcoded fallback in `lib/workflows/serveWorkflows.ts` / `app/workspace/page.tsx` if unset. All browser-exposed (`NEXT_PUBLIC_`) since they are only used to build outbound `<a href>` links, never sent to a server.

| Variable | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_CINCH_CCM_URL` | CINCH CCM login | `https://www.cinchccmportal.com/login` |
| `NEXT_PUBLIC_AXISCARE_URL` | AxisCare platform origin (also the base for the Real Time View deep link) | `https://16282.axiscare.com/` |
| `NEXT_PUBLIC_APPLOI_URL` | Apploi login | `https://hire.apploi.com/v2` |
| `NEXT_PUBLIC_VIVENTIUM_URL` | Viventium login | `https://hcm.viventium.com/apps/account/viventium/login` |
| `NEXT_PUBLIC_SERVE_INTAKE_URL` | Serve Intake app | `https://serve-intake-mvp.vercel.app/` |
| `NEXT_PUBLIC_DIALPAD_URL` | Dialpad login | `https://dialpad.com/login` |
| `NEXT_PUBLIC_GMAIL_URL` | Google Workspace mail | `https://mail.google.com/` |

### AxisCare integration (read-only)

All server-only, all read via `process.env` in exactly one module,
`lib/integrations/axiscare/config.ts`. **Never** prefixed
`NEXT_PUBLIC_`; never reachable from the browser.

| Variable | Purpose | Required | Example | If absent |
|---|---|---|---|---|
| `AXISCARE_API_TOKEN` | Bearer token for AxisCare API auth | Required for the integration to function | *(never write a real value into any document)* | `getAxisCareConfig()` throws a `configuration`-category error; `getAxisCareTodaysSchedule()` returns `available: false, reason: "not_configured"` |
| `AXISCARE_SITE_NUMBER` | AxisCare site/tenant number (embedded in the hostname, not sent as a header) | Required | `16282` | Same as above |
| `AXISCARE_API_VERSION` | Sent verbatim as the `X-AxisCare-Api-Version` header | Required | `2023-10-01` | Same as above |
| `AXISCARE_API_BASE_URL` | Bare AxisCare server origin — **must not** end in `/api` (every endpoint path already includes it) | Required | `https://16282.axiscare.com` | Same as above; a value ending in `/api` or using `http://` is actively rejected, not just missing |

### Scheduling feature flag

| Variable | Purpose | Exposure | Required | Scope | Example | If absent |
|---|---|---|---|---|---|---|
| `AXISCARE_SCHEDULE_ENABLED` | Gates Workspace's live AxisCare schedule feature, independent of the credentials above | **Server-only** — no `NEXT_PUBLIC_` prefix, enforced by a repo-wide test | Optional | Per-environment (Preview: `true`; Production: must stay `false`/absent until Hud approves) | `true` | Treated as disabled — `getAxisCareTodaysSchedule()` returns `available: false, reason: "disabled"` before any AxisCare request or credential check. Only the exact string `"true"` enables it; `"TRUE"`, `"True"`, `"1"`, empty string, and anything else are all disabled. |

### Deployment platform

| Variable | Purpose | Required | Notes |
|---|---|---|---|
| — | Node version pinned via `netlify.toml`'s `[build.environment] NODE_VERSION = "22"` | — | **Unverified against actual current deploy target** — see the Vercel/Netlify discrepancy in `ARCHITECTURE.md`'s 2026-07-13 entry. No Vercel-specific configuration file (`vercel.json`) exists in this repository as of this date, despite live evidence Vercel is what auto-deploys pushes. |

### Failure behavior summary

Every integration in this document fails **closed and honestly**, never
silently: missing Supabase config prevents the app from functioning at
all (by design — there's no meaningful degraded mode for a database-backed
app); missing Resend config silently skips notification sends (a known,
accepted gap, not yet hardened); missing or misconfigured AxisCare config
produces a sanitized `not_configured`/`invalid_response`/etc. result that
Workspace renders as a calm fallback panel, never a raw error or a crash;
a disabled or absent `AXISCARE_SCHEDULE_ENABLED` produces the same calm
fallback treatment, deliberately indistinguishable from a misconfigured
environment in what it reveals (nothing about credential presence).