## 2026-07-01 Architecture Update

Serve OS architecture has shifted toward an Operating System model rather than a standalone application.

Current architectural principles:

- Serve OS is the operational layer above external systems.
- External systems execute work.
- Serve OS organizes, tracks, and understands work.
- Residents are the canonical business object.
- External systems enrich resident relationships rather than own them.

Current system roles:

Serve OS
- Resident directory
- Relationship management
- Operational dashboard
- Workspace
- Community Intelligence
- Ask Serve
- Future proposal engine
- Future assessment engine

External Systems

Apploi
- Recruiting

Viventium
- HR
- Payroll
- Employee administration

Cinch CCM
- Community Care execution

AxisCare
- Traditional Home Care execution

Dialpad
- Phone
- Call transcripts
- Relationship history

Google Workspace
- Email
- Documents

Serve Intake
- Assessment
- Proposal generation
- Draft email generation

Design philosophy:

Employees work inside Serve OS.

Serve OS launches external systems as needed.

External systems will gradually be replaced by native Serve functionality while preserving employee workflow.

Authentication is now production-ready.

Serve OS uses Supabase Authentication with Resend SMTP for branded password reset emails. Password recovery is fully self-service and no longer requires administrator intervention.

## 2026-07-03 — Website Architecture Stabilization

### Public Website

The public website remains a static Netlify-hosted marketing site.

Current production architecture intentionally uses native Netlify Forms for all website submissions. Supabase and Resend integration remain under development and are not yet part of the production website.

Current active form architecture:

- Family Consultation
- Professional Referral
- Managing Director Application
- Caregiver Application
- Partner Referral

### Canonical Data Direction

Although multiple public forms exist for different audiences, the long-term architecture is:

Multiple public entry points
→ One canonical referral/intake record
→ Serve OS
→ Notifications
→ Cinch CCM

Professional Referral and Partner Referral are intentionally treated as separate user experiences but should ultimately write into a single canonical referral record with source attribution.

Current production source of truth:
Netlify Forms

Future source of truth:
Supabase canonical intake database

## 2026-07-04 — Conversational Intake Operationalization

Completed the first end-to-end operational pipeline connecting the redesigned public website to Serve's backend infrastructure.

Verified production-capable flow:

Public Website
→ Conversational Care Inquiry
→ Netlify Forms (fallback)
→ Netlify Function
→ Supabase
→ Resend Notifications

This establishes Supabase as the canonical operational datastore while preserving Netlify Forms as an independent capture path during the transition period.

Future architecture remains:

Care Inquiry
→ Qualification
→ Community Care OR Traditional Home Care
→ Serve Client

## 2026-07-05 — Homepage Intake Architecture Expansion

The homepage conversational intake architecture has matured into two independently testable UX approaches:

- Version A — Conversation First
- Version B — Progressive Homepage Intake

Both versions intentionally reuse the same conversational intake engine, Netlify Functions, Supabase integration, and notification pipeline. The only architectural difference is the timing of when the conversation is revealed to the visitor.

Professional Referral has become a first-class Care Inquiry workflow rather than simply another relationship selection. The intake now supports referral-specific conversation paths while remaining aligned with the overall Care Inquiry architecture.

Serve OS has begun recognizing Professional Referral inquiries as distinct operational records through inquiry classification and improved administrative presentation.

