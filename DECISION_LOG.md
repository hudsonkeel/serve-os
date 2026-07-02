# Decision Log

Decisions are recorded here in order. Each entry includes the date, the decision, and the reason.
This log is append-only — do not modify past entries; add new ones at the bottom.

---

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-28 | Separate canonical assessment record from Cinch CCM | Preserve version history, auditability, AI reasoning, and vendor independence. Cinch receives only the approved operational subset. |
| 2026-06-28 | Build Intake before Serve OS | Immediate operational value. Validate the data model before building the dashboard. |
| 2026-06-28 | Human review is mandatory before any push to operational systems | AI assists; humans decide. Never allow AI to push records directly into production. |
| 2026-06-28 | Deterministic pricing engine — AI extracts facts, engine calculates price | Explainable, repeatable, auditable. Price must not be a generated estimate. |
| 2026-06-28 | Workflow-first development philosophy | Understand and simplify before automating. Avoid encoding broken processes. |
| 2026-06-28 | Netlify remains production host for public-facing properties | Website is already deployed there. No reason to migrate yet. |
| 2026-06-29 | `/get-started` is the unified public entry for both care seekers and job seekers | One URL, one experience, one codebase. Mode-switching via query param (`?mode=care` / `?mode=careers`). Reduces surface area and maintenance burden. |
| 2026-06-29 | `recruiting_leads` is a separate Supabase table from `prospects` | Different entity type (employee vs. care seeker), different lifecycle, different workflow. Mixing them would require too many nullable fields and create ambiguity in reporting. |
| 2026-06-29 | Notification system is event-driven (`emitEvent` → rules → channels) | Decouples forms and actions from notification logic. Adding a new channel (SMS, Slack) or a new recipient list requires no change to the caller. Rules are pure code — easy to read, test, and extend. |
| 2026-06-29 | Email recipients stored in env vars, not a database table | No deploy needed to change recipients. Avoids building a premature admin UI. Acceptable for the current staff size and workflow. |
| 2026-06-29 | Apploi redirect is optional and tracked; MD role has no Apploi path | Caregiver formal application lives in Apploi. MD pipeline is manual and relationship-driven — no external portal. `apploi_redirected_at` timestamp enables funnel tracking. |
| 2026-06-29 | `/careers` URL redirects to `/get-started?mode=careers` rather than hosting a separate page | External links and marketing materials pointing to `/careers` continue working. Avoids duplicating the entry experience. |
| 2026-06-29 | Recruiting status vocabulary: `new → contacted → in_review → applied → not_a_fit → hired → archived` | Mirrors the actual Serve recruiting workflow. Initial migration used generic terms that did not match operations; second migration aligned them. |
