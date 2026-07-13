# Serve OS — Production Readiness

**Project:** Serve OS  
**Repository:** hudsonkeel/serve-os  
**Hosting:** Netlify  
**Database:** Supabase  
**Environment:** Production  
**Last Verified:** June 30, 2026

---

# Purpose

This document records the current production readiness status of Serve OS and serves as the engineering verification checklist before expanding the platform with additional modules.

Only production-verified functionality should be marked complete.

---

# Production Architecture

Website

↓

Netlify

↓

Next.js Server Actions

↓

Supabase

↓

Notification Service

↓

Resend

↓

Serve Recruiting Inbox

---

# Verified Production Components

## Infrastructure

- ✅ Netlify production deployment
- ✅ Next.js production build
- ✅ Production routing
- ✅ Production environment variables
- ✅ Supabase production database connection
- ✅ Resend email integration

---

## Recruiting Module

### Caregiver Inquiry

Status: **Production Verified**

Verified:

- ✅ Website intake form
- ✅ Server Action execution
- ✅ Validation
- ✅ Supabase insert
- ✅ Recruiting dashboard
- ✅ Status workflow
- ✅ Notification email
- ✅ Production routing

---

### Managing Director Inquiry

Status: **Production Verified**

Verified:

- ✅ Website intake form
- ✅ Resume upload
- ✅ Supabase Storage bucket
- ✅ Resume metadata
- ✅ Supabase insert
- ✅ Recruiting dashboard
- ✅ Notification email

---

## Supabase

Verified:

- ✅ recruiting_leads table
- ✅ Migration 0000 applied
- ✅ Migration 0001 applied
- ✅ Migration 0002 applied
- ✅ recruiting-resumes storage bucket
- ✅ Resume uploads
- ✅ Status updates
- ✅ Production data persistence

Current recruiting statuses:

- new
- contacted
- in_review
- applied
- not_a_fit
- hired
- archived

---

## Notifications

Verified pipeline:

Website

↓

Server Action

↓

Supabase Insert

↓

Notification Event

↓

Notification Rules

↓

Resend

↓

Serve Recruiting Inbox

Verified:

- ✅ Caregiver notification
- ✅ Managing Director notification
- ✅ Logging
- ✅ Production email delivery

---

## Current Verified Production Routes

| Route | Status |
|--------|--------|
| / | ✅ |
| /recruiting | ✅ |
| /residents | ✅ |
| /residents/[id] | ✅ |
| /prospects | ✅ |
| /community-intelligence | ✅ |
| /ask-serve | ✅ |
| /get-started | ✅ |

---

# Remaining Production Items

## High Priority

- [ ] Resolve Netlify secrets scan warning
- [ ] Remove or implement /settings route
- [ ] Decide notification behavior for duplicate recruiting submissions

---

## Medium Priority

- [ ] Convert resume storage to private bucket with signed URLs
- [ ] Remove temporary diagnostic logging
- [ ] Clean up unused helper code
- [ ] Remove orphaned routes if no longer needed

---

# Current Production Readiness

Overall Status:

**Production Ready**

Current readiness estimate:

**93 / 100**

Serve OS is considered stable enough to serve as the production foundation for future operational modules.

The Recruiting module has completed end-to-end production verification.

---

# Next Engineering Milestone

Begin production implementation of:

- Website Care Prospect intake
- Prospect Management
- Resident lifecycle
- Operational intelligence
- Serve OS becoming the operational brain for Serve Caregiving

Future modules should build upon the existing production infrastructure without replacing or redesigning the verified recruiting foundation.

---

# Revision History

## June 30, 2026

Production recruiting module fully validated.

Completed:

- Production deployment
- Recruiting workflow
- Caregiver inquiry
- Managing Director inquiry
- Resume upload
- Supabase integration
- Recruiting dashboard
- Notification service
- Resend integration
- SQL migrations
- Storage bucket
- Production routing
- Status workflow

This marks the first fully production-verified module of Serve OS.

Current readiness

Website

✓ Ready

Serve OS

✓ Pilot Ready

Authentication

✓ Ready

Resident database

✓ Ready

Workspace

✓ Ready

Employee Portal

✓ Ready - But not connected to live website

Notifications

✓ Ready

Live resident data

✓ Ready

Remaining before wider rollout

- Proposal Builder refinement
- Timeline
- Relationship history
- Assessment improvements
- Additional operational testing with Elizabeth

## Production Readiness

Status: READY

Completed

✅ Public website production deployment

✅ Native Netlify Forms operational

✅ Form detection validated

✅ Repository cleanup

Outstanding

□ Supabase production intake pipeline

□ Resend notification routing

□ Canonical intake database

□ Unified referral backend

Production Readiness

Completed

✅ Conversational homepage
✅ Deploy Preview verification
✅ Netlify Forms
✅ Cache-control validation
✅ Supabase pipeline
✅ Resend notifications
✅ Authentication restored

Pending

- Leadership review
- Production deployment
- Serve OS Care Inquiry operational integration

## Homepage Readiness

Version A

- Feature complete
- Awaiting stakeholder review

Version B

- Functional prototype
- Awaiting stakeholder review

Professional Referral

Operational workflow connected through homepage intake and Serve OS administrative recognition.

Remaining work

- Canonical Care Inquiry schema
- Final Supabase review
- Final notification review
- Production merge decision

## 2026-07-06

### Operational Readiness Focus

The pilot emphasis has shifted from infrastructure validation toward employee workflow validation.

Current success metric:

"Can Elizabeth complete today's work more easily than yesterday?"

Upcoming production milestones:

- Daily Operations Workspace
- Resident 360
- Resident Relationship Timeline
- Unified employee work queue
- Context-driven operational navigation

## 2026-07-13 — AxisCare Read-Only Integration Readiness Assessment

This section deliberately does **not** mark the AxisCare integration
"production ready" merely because it is read-only. Read-only removes one
class of risk (accidental data corruption in the vendor system) but does
not by itself establish reliability, supportability, or safe degraded
behavior. Each dimension below is assessed on its own merits.

| Dimension | Status | Notes |
|---|---|---|
| Reliability | 🟡 Partially assessed | Live-verified against real AxisCare data once (manual comparison against AxisCare Real Time View). No sustained uptime/reliability track record yet — this is day-one verification, not production experience. |
| Stale-data behavior | 🟡 Acceptable for current scope, not hardened | No caching layer; every Workspace page load fetches live (`dynamic = "force-dynamic"`, `revalidate = 0`). This means no explicit "data is N minutes old" staleness ever occurs, but also means Workspace load time is fully coupled to AxisCare's live response time — no timeout-driven fallback has been exercised against a real slow endpoint, only fictional fixtures. |
| Error transparency | ✅ Solid | Every failure mode (not configured, authentication, authorization, timeout, upstream unavailable, invalid response, unknown, feature-disabled) maps to one fixed, sanitized, non-leaking message. Verified by test, not just code inspection. |
| Credential handling | ✅ Solid | Token is read from `process.env` in exactly one module and never logged, returned, or serialized — verified by dedicated tests asserting a fictional token value never appears in any output, including error messages and configuration-state objects. |
| Rate limits | ⬜ Unknown | AxisCare's rate-limit behavior and headers have not been characterized. The integration has a `rate_limit` error category, but its real-world trigger conditions are unverified. |
| Logging | 🟡 Partial | Discovery/test output is deliberately sanitized (never logs field values, never logs the token). No structured production logging/observability exists for the live schedule path itself (no request-count, latency, or error-rate metrics are emitted anywhere). |
| Supportability | 🟡 Documented, not yet operationally exercised | `docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md` and `docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md` are thorough, but no one besides this development session has operated the integration under real conditions yet. |
| Monitoring | ⬜ None | No alerting exists for sustained AxisCare failures, elevated error rates, or the feature silently sitting disabled longer than intended. |
| Auditability | 🟡 Partial | Removed-visit and status-normalization decisions are deterministic and documented, but no persistent audit trail of what Workspace displayed at a given time exists (nothing is written to Supabase — by design, per the read-only/no-persistence policy — which is also why there is no historical record to audit later). |
| Privacy | ✅ Solid | Structurally enforced, not just conventional — `ServeScheduleVisit`'s type shape excludes phone/address/DOB/email/notes/diagnoses/billing entirely; a dedicated test asserts a fictional sensitive-field-laden fixture never survives normalization. |
| Feature flag safety | ✅ Solid | `AXISCARE_SCHEDULE_ENABLED` is checked before any credential lookup; a disabled feature makes zero requests and reveals nothing about credential state; a repo-wide test confirms no client-side code path can read the flag. |
| Rollback / disablement | ✅ Solid | Three-tier emergency plan documented in `docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`'s "Release Control": (1) set the flag false and redeploy — normal path; (2) revoke the AxisCare token — emergency, affects every consumer of that token; (3) roll back the deploy entirely. |
| User-visible error handling | ✅ Solid | Every unavailable state renders a calm, non-technical fallback panel with a working AxisCare deep link — never a stack trace, never raw vendor text. |

### Overall assessment

**Not yet a blanket "production ready."** The integration is
well-engineered for correctness, privacy, and safe failure — but
reliability under sustained real-world load, rate-limit behavior, and
operational monitoring are genuinely unverified, not just unmentioned.
**Recommended before enabling in production:** confirm AxisCare rate
limits, add basic request/error observability, and run the feature in a
Preview/branch-deploy environment for a meaningful period before
flipping `AXISCARE_SCHEDULE_ENABLED=true` in production.

### External vendor dependency risk

Serve OS's Workspace schedule feature is now dependent on AxisCare's
uptime and response time for its own page load performance (mitigated by
the feature flag — this dependency can be switched off instantly without
a code deploy, only an environment-variable change and redeploy).

### Deploy platform readiness — unresolved

Cannot be assessed accurately until the Vercel/Netlify discrepancy
(`ARCHITECTURE.md`, 2026-07-13 entry) is reconciled. `netlify.toml`
exists and specifies Node 22, but live evidence shows Vercel is the
platform actually auto-deploying this repository on push. Any
environment-variable configuration performed on the "wrong" platform
would have no effect on the live deployment.