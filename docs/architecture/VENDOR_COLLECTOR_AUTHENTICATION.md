# Vendor Collector Authentication & Secret Management — Implementation Plan

**Document Type:** Implementation Plan — inspection findings + concrete design, **not code, not a migration**
**Status:** Draft — Awaiting Review Before Any Migration or Code Is Written
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-20

*This is the authentication/secret-management substrate for the Collector abstraction defined in [`SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md`](../intelligence/SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md) §17. It is prerequisite infrastructure — nothing here builds an Apploi or Viventium collector itself.*

**No migration has been applied. No code has been written. No credentials have been entered. Nothing has been staged, committed, pushed, or deployed.**

---

## 0. Inspection Findings

Read before designing anything, per the tasking's own ordering.

| Area | Finding |
|---|---|
| **Supabase Vault** | No usage anywhere in this codebase today. A read-only probe against this session's connected project (`select ... from vault.secrets limit 0` via the JS client) returned `Invalid schema: vault` — **this does not prove Vault is disabled**, only that the `vault` schema is not exposed to PostgREST, which is Vault's normal, correct posture (it's accessed via SQL functions you define, never directly over the REST API). **Whether the `vault`/`pgsodium` extension is actually enabled on this Supabase project cannot be confirmed from this session** (no direct SQL/psql access, as has been true all session). This must be confirmed via the Supabase Dashboard (Database → Extensions) or a session with real SQL access before Section A below is finalized. |
| **Storage** | One existing bucket precedent: `recruiting-resumes`, created ad hoc (no migration found defining it) and used with `.getPublicUrl()` — i.e., **public**. There is no existing private-bucket-with-restrictive-policy precedent in this codebase to follow; the design below is genuinely new. |
| **Existing single-secret vendor pattern** | `lib/integrations/axiscare/config.ts` + `client.ts` is the closest precedent: one static API token, resolved from `process.env` in exactly one file, never logged, never returned as a whole object, GET-only client, categorized/sanitized errors (`AxisCareError`, `safeErrorMessage`) that never leak vendor payload or the token. This is the right *discipline* to carry forward but the wrong *mechanism* — a single env-var token has no notion of session artifacts, MFA, or per-account isolation, all of which this task requires. |
| **Supabase client roles** | `lib/supabase/server.ts` exposes exactly two server-side clients: `createServerClient()` (service role) and `createAnonServerClient()` (anon). **No third, more-restricted role exists today.** This matters directly for "restrict secret retrieval to the dedicated collector runtime" — see §A's honest treatment of this constraint. |
| **Deployment target** | `netlify.toml` confirms Netlify is the actual deployment target (`npm run build`, publish `.next`). This confirms the tasking's own warning was correct to make explicit: Netlify Functions are short-lived, stateless, have no bundled Chromium, and offer no way for a human to see a "visible browser" during MFA. **Netlify Functions cannot be the browser runtime for this capability, full stop** — see §F. |
| **Playwright** | `@playwright/test` is already a devDependency, but there is no `playwright.config.ts`, no `*.spec.ts` file, and no browser install evidence anywhere in the repo — it is present but unused today. The real `playwright` package (not just the `@playwright/test` runner wrapper) is not yet a dependency and would need to be added. |
| **Local script runtime** | This entire session has repeatedly used the pattern `node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/<name>.ts`, run manually by a human against `.env.local`. This is already this codebase's proven shape for "a human runs a privileged, service-role-authenticated script locally" — and it is exactly the right shape for Phase 1's supervised MFA flow (§F). |
| **Secret hygiene conventions** | `.gitignore` already excludes `.env*` (except `.env.example`); every existing migration follows `revoke ... from public; grant ... to service_role`; every existing script/data-layer function resolves secrets from `process.env` in one place only. These conventions extend directly to this design without modification. |

---

## A. Credential Storage

**Mechanism:** Supabase Vault, if confirmed available (§0) — encrypted-at-rest, application tables never hold a secret value, only a pointer.

- New table `collector_vendor_accounts` — **no secret column**. Holds: `id`, `vendor` (`apploi` \| `viventium` \| ...), `account_identifier` (login username — not secret), `credential_secret_id uuid` (the Vault key id returned by `vault.create_secret()`), `credential_rotated_at`, `credential_expires_at`, `rotation_reminder_days`, `created_by`, `created_at`.
- A `SECURITY DEFINER` Postgres function, `get_collector_credential(p_vendor_account_id uuid) returns text`, is the **only** code path that ever resolves a Vault secret to plaintext. `revoke execute ... from public, anon, authenticated; grant execute ... to service_role`.
- **Honest limitation on "restrict retrieval to the dedicated collector runtime":** Supabase's standard role model gives this project exactly three PostgREST-selectable roles (`anon`, `authenticated`, `service_role`) — there is no fourth, narrower role already available to grant this function to exclusively (§0). A genuinely stronger boundary (a fourth role reachable only via a custom-signed JWT) is possible in principle but unverified against this project's actual Supabase configuration, and is real added complexity. **Phase 1's boundary is therefore a code-convention boundary, not a database-role boundary**: `get_collector_credential` is callable by anything holding the service-role key, but by *convention and code review*, it is only ever called from `lib/collectors/runtime/credentialStore.ts`, itself only ever imported by the local collector scripts (§F) — never from any Next.js server action, route handler, or general application code path. This is an acceptable interim control for a human-supervised, local-only Phase 1, not a permanent architecture — flagged in §37-style open questions below.
- **Rotation metadata, not values:** `credential_rotated_at`/`credential_expires_at`/`rotation_reminder_days` are plain columns; rotating a credential means calling `vault.update_secret()` (or creating a new secret and updating `credential_secret_id`) and stamping these columns — never a value stored in an application table.
- **Bootstrapping (one-time, manual, local-only):** the actual first username/password for a given vendor account is entered exactly once, by a human, directly into a local `psql`/SQL console session (or a narrow one-off script that immediately discards the plaintext after the `vault.create_secret()` call) — **never** typed into a `.env.local` file, a script argument, or any file that could be committed. This bootstrapping procedure is Phase 1's only moment where a human handles the raw secret at all.
- **Fallback if Vault is unavailable:** `pgsodium`-encrypted columns directly on `collector_vendor_accounts` (same underlying primitive Vault itself uses, one layer lower, still never exposed via PostgREST) — named here as the fallback path, not designed further until §0's Vault-availability question is answered.

---

## B. Session Storage

- Playwright's `storageState` (cookies + localStorage) is treated as a secret exactly as sensitive as a password, per the tasking.
- **Encryption:** AES-256-GCM, in `lib/collectors/runtime/sessionStore.ts`, immediately after `context.storageState()` returns — the plaintext is never logged, never returned from the encrypting function, and never written to disk unencrypted. The encryption key itself is sourced from Vault (a `session_encryption_key` secret, resolved the same restricted way as §A), with a local `.env.local` env var (`COLLECTOR_SESSION_ENCRYPTION_KEY`, generated via `openssl rand -base64 32`, gitignored, never committed) as the explicit Phase-1-only fallback if Vault isn't yet available.
- **Storage location:** a new **private** Supabase Storage bucket, `collector-sessions` — no public-read policy, access restricted to `service_role` only, unlike the existing `recruiting-resumes` bucket. Object path convention: `<vendor>/<account_identifier>/session-<timestamp>.enc`.
- **Relational metadata only**, on a new `collector_sessions` table — exactly the field list requested, no more: `vendor`, `account_identifier` (FK to `collector_vendor_accounts`), `status` (§C), `artifact_path` (the Storage object path, never content), `last_authenticated_at`, `last_validated_at`, `expires_at` (nullable), `authenticated_by` (the human who completed MFA).
- **`.gitignore` addition needed:** any transient local working directory the Playwright flow uses before encrypt-and-upload (e.g. `./tmp/collector-sessions/`) — the file itself is deleted immediately after upload, but the path is gitignored as defense in depth regardless.
- **Never printed, anywhere:** cookies, localStorage, tokens, or storage-state content. Enforced structurally the same way `AxisCareConfig` already enforces "never log the token" — the function that reads raw `storageState` has no path back to a `console.log`/error message/return value that could surface it.

---

## C. Authentication State Model

Exactly the seven states requested, stored on `collector_sessions.status`:

| State | Set When |
|---|---|
| `connected` | Session reuse succeeded, or MFA flow completed and confirmed |
| `authentication_required` | No valid session exists; password entry needed |
| `mfa_required` | Password accepted, vendor is now presenting an MFA challenge — the pause point in §D |
| `session_expired` | A previously `connected` session failed validation on reuse |
| `locked` | The vendor's own UI indicates the account is locked out |
| `access_denied` | The vendor's own UI indicates access is denied for a reason other than lockout (e.g. revoked access) |
| `vendor_unavailable` | Network/outage failure distinct from any authentication outcome — never conflated with `access_denied` |

---

## D. Human-Assisted MFA Flow

The ethically load-bearing section — every rule below is a hard constraint, not a default.

```
1. Launch a VISIBLE (headed, non-headless) Playwright browser.
   Headless would defeat the entire purpose of human supervision.

2. Attempt session reuse: load the decrypted storageState into a fresh
   context, navigate to a known "am I logged in" URL, positively confirm a
   logged-in indicator.
   → If confirmed: status = connected. Done. No human involved.
   → If NOT positively confirmed (this includes any ambiguous result —
     never assume success): proceed to step 3.

3. If a password field is present, fill it using the credential resolved
   via get_collector_credential() (§A) — typed via Playwright's normal
   .fill(), exactly as a human would, never via a DOM/cookie/token bypass.

4. If the vendor then presents anything MFA-shaped (email code, SMS code,
   authenticator prompt, the vendor's own challenge page) or a CAPTCHA:
   → status = mfa_required. PAUSE. Do not proceed automatically.
   → Print a clear prompt: "MFA required for <vendor>/<account>. Complete
     it directly in the open browser window, then confirm here."
   → The human completes the REAL challenge themselves, in the visible
     browser, using their own device/email/authenticator/CAPTCHA-solving.
     The script touches none of it.

5. On human confirmation, re-check the logged-in indicator (never trust
   the human's confirmation alone — verify it).
   → If confirmed: capture storageState, encrypt (§B), upload, update
     collector_sessions (status = connected, last_authenticated_at = now,
     authenticated_by = <operator identity>).
   → If NOT confirmed: do not mark connected; surface the discrepancy.
```

**Hard prohibitions, restated as implementation constraints, not aspirations:**
- Never store an OTP/authenticator code — the script never reads the challenge field at all; the human types directly into the browser.
- Never read personal email or SMS — no such integration exists in this design, at all.
- Never automate CAPTCHA-solving — same pause-and-handoff as MFA.
- Never attempt any bypass — no cookie injection, no token forgery, no "remember this device" harvesting beyond what a normal human-directed login naturally produces.

---

## E. Collector Behavior

- **Auth failure → the CollectorRun records `status: "failed"`** with a structured `errorCategory` (`authentication_required` \| `mfa_required` \| `session_expired` \| `locked` \| `access_denied` \| `vendor_unavailable` — reusing §C's vocabulary, mirroring `AxisCareError`'s categorized-error pattern) — never a bare thrown exception with a vendor-shaped message.
- **The critical fairness rule:** a Requirement's evaluation (per [`SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md`](../intelligence/SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md) §9) must structurally distinguish **"no Evidence exists"** from **"we could not determine whether Evidence exists because the source was unreachable."** The latter must never render, store, or reason as `unmet` in a way indistinguishable from genuine absence — it surfaces as its own explicit status ("source unavailable — last known state as of `<last_validated_at>`"), and no downstream Rule may treat it as a negative finding.
- **Staleness is a displayed, derived property**, computed from `HistoricalFact.recordedAt` vs. now — not itself stored.
- **A deterministic collector-health Signal** — `platform.collector_evidence_stale` (domain-agnostic; lives in `lib/intelligence/operational/`, not a `recruiting`-specific Rule, since staleness detection applies to every future domain's collectors identically) — fires when evidence exceeds a freshness threshold. **The threshold itself ships as an explicitly unapproved `RuleVersion.parameters` value** (e.g. `{ staleAfterHours: <proposed, needs Hud approval> }`), per the Engineering Standards' own "Hud-approved or still proposed" discipline — no number is picked here.

---

## F. Runtime

- **Netlify Functions are confirmed unsuitable** (§0): no persistent process, no bundled browser, and structurally cannot present a visible window to a human during MFA. This is not a workaround-able limitation — it's why Phase 1 is local.
- **Phase 1 runtime: local, human-run, exactly this codebase's proven script pattern.** A new script, `scripts/collectors/authenticate-vendor-session.ts`, run as `node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/collectors/authenticate-vendor-session.ts --vendor=apploi --account=<identifier>`, executed manually by an authorized operator on their own machine, using the real `playwright` package (needs adding as a dependency) with `npx playwright install chromium` run once locally.
- **Production worker — proposed, not built now.** Netlify Functions are ruled out; a small always-on or on-demand compute target outside Netlify (e.g. a dedicated small VM/container) would be needed for *session-reuse* collection at production cadence. Critically: **MFA renewal should never happen on that production worker at all** — a human-visible browser has no meaning on a headless production box. The clean separation: the production worker only ever attempts session reuse (§D step 2) and, on failure, marks the session `session_expired`/`mfa_required` and stops — it never attempts password entry or MFA itself. Renewal always happens via the local supervised flow above, which uploads the refreshed encrypted session to the same shared `collector-sessions` bucket the production worker reads from. This is a proposal for later, not a Phase 1 build item.

---

## G. Security — Threat Model

| Threat | Mitigation |
|---|---|
| Credential disclosure | Vault-only storage, no application-table secret column, no repo/env-file storage, restricted-RPC retrieval (§A) |
| Session theft | Encrypted at rest, private Storage bucket, no public policy, no plaintext ever written to disk |
| Log leakage | Structured, categorized errors only (mirrors `AxisCareError`); raw vendor pages/DOM content never logged |
| Screenshots | **Default off.** Debugging screenshots/traces only via an explicit opt-in flag, written to a gitignored temp path, auto-deleted |
| Browser downloads | Playwright's download handling disabled/blocked by default for these contexts — no file the vendor site offers is auto-accepted |
| Cross-vendor profile contamination | One isolated Playwright `userDataDir`/context **per (vendor, account)** — never shared |
| Unauthorized collector invocation | Local-only execution (§F) requires local machine access + the service-role key; no network-reachable trigger exists in Phase 1 |
| Stale sessions | `last_validated_at` + the staleness Signal (§E) surface this explicitly rather than silently trusting an old session |
| Lost/compromised worker | Phase 1's worker is a developer's own machine, not a shared always-on box — blast radius is the one operator's environment; production-worker compromise handling is deferred to the Section F proposal |
| Excessive account permissions | Out of this document's control — flagged in §37-style open questions: request the narrowest vendor-account permission tier that still allows the needed reads |

- **Audit, append-only:** a new `collector_session_audit_log` table — one row per login attempt, per MFA pause, per MFA resume/confirmation: `event_type`, `vendor_account_id`, `actor`, `occurred_at` — **never** the code/secret itself. Mirrors this codebase's established append-only Outcome/CollectorRun convention.

---

## Exact Files (Phase 1 — none created yet)

| File | Purpose |
|---|---|
| `supabase/migrations/<ts>_create_collector_credential_infrastructure.sql` | `collector_vendor_accounts`, `collector_sessions`, `collector_session_audit_log`, `get_collector_credential()`, the `collector-sessions` Storage bucket + policies, all `revoke`/`grant` statements |
| `lib/collectors/runtime/credentialStore.ts` | The one module that ever calls `get_collector_credential()` |
| `lib/collectors/runtime/sessionStore.ts` | Encrypt/decrypt + Storage upload/download for session artifacts |
| `lib/collectors/runtime/mfaFlow.ts` | The Playwright headed-browser orchestration described in §D |
| `lib/collectors/runtime/types.ts` | `AuthenticationState` and related shared types |
| `scripts/collectors/authenticate-vendor-session.ts` | The local, human-run entrypoint |
| `.gitignore` | Add the transient local session-artifact working directory |
| `package.json` | Add `playwright` as a real dependency; add an `authenticate:collector-session` script entry |

---

## Rollback Strategy

- The migration is purely additive — new tables, one new function, one new bucket. Rollback is `drop table`/`drop function`/bucket deletion, touching nothing that exists today. Same zero-risk shape as every migration this session has already used.
- If Vault proves unavailable, no data is lost by switching to the `pgsodium`-column fallback (§A) — no credential has been stored yet at the point this decision is made, since bootstrapping is Phase 1's first real action, not a prerequisite to designing the schema.
- Session artifacts have no coupling to any other part of the app — deleting the bucket and dropping `collector_sessions`/`collector_session_audit_log` fully removes this capability with no side effects elsewhere.

---

## What Can Be Implemented Now vs. Requires Vendor/Policy Confirmation

**Can proceed now, pending only your review of this plan:**
- Schema design and migration (contingent on §0's Vault-availability confirmation).
- `lib/collectors/runtime/*` and the local script, built and tested against a Playwright automation-test site (e.g. a throwaway test login page), never a real vendor, until the item below is cleared.
- The private Storage bucket, encryption, audit log, and threat-model mitigations.

**Requires explicit confirmation before touching Apploi or Viventium at all:**
- Each vendor's Terms of Service must be reviewed for whether *any* automated or scripted login — even human-supervised, human-typed-credential, human-completed-MFA — is permitted. This is unresolved and was already flagged as a dependency in both prior design documents; it is restated here because this is the document where it actually matters operationally, not just architecturally.
- Explicit internal approval naming the specific test/non-production account this may run against, per the tasking's own instruction.
- Confirmation of who is authorized to complete MFA on Serve's behalf (an approved human list, not "whoever is at the keyboard").
- Confirmation of Supabase Vault's actual availability on this project (§0).
- Hud approval of the staleness threshold (§E) and of any session-artifact/audit-log retention duration.

---

*Nothing in this document has been implemented. No migration exists. No credential, real or test, has been entered anywhere. Stopping here for review, as instructed.*
