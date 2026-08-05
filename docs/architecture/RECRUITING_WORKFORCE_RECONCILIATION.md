# Recruiting-to-Workforce Lifecycle Reconciliation

Post-Release Stabilization, AxisCare Operational Synchronization,
Workstream 3. Read-only investigation against live Supabase
(`recruiting_leads`, `workforce_members`, `person_vendor_identity_links`).
**No record was modified to produce this report.**

## Root cause

`workforce_members.source_recruiting_lead_id` — the column that
structurally links a workforce member back to the recruiting lead they
came from — **is `null` on every single one of the 17 live workforce
members**, including Alma Owolabi's. There is no code path anywhere in
the repository that ever sets it. Recruiting lead status
(`recruiting_leads.status`) is set manually via `RecruitingWorkflowActions`
and is never derived from workforce state. **No conversion/closure rule
exists at all** — this is a structural gap, not a bug in an existing
rule, and not name-variation, a stale collector result, or a missing
vendor link (Alma's workforce-side AxisCare link is real and confirmed —
see below).

## Alma Dhora Owolabi — evidence-backed reconciliation

| System | Identity found | Evidence |
|---|---|---|
| `recruiting_leads` | `0e5bc40a-e5f0-4e90-84d0-b46841da971a`, "Alma Dhora Owolabi", status `in_review` | Created manually by Hud (`source: manual_vendor_reconciliation`) with a written note: observed in Apploi ("Requested Interview") and Viventium ("New Hires," dated 2026-07-15). **No email or phone on file.** |
| Apploi (via `recruiting_lead_vendor_identities`) | vendor record `Q2FuZGlkYXRlOjc2MzY0MTEy`, confirmed | 5 observations collected 2026-07-21 (name, position, resume availability, no-Viventium-integration-found) |
| `workforce_members` | `454d1069-a7ff-4e34-aa53-e45201c9fb1a`, "Alma Owolabi" | Created 2026-07-29 by Hud directly (not via any conversion flow — `source_recruiting_lead_id: null`). Email `almaola2019@gmail.com`, phone `972-330-1505`. |
| AxisCare (via `person_vendor_identity_links`, `subject_type=workforce_member`) | vendor record `41`, **status: confirmed** | `approved_source_data`: `statusLabel: "Active"`, `statusActive: true`, `hireDate: "2026-07-13"`, `startDate: "2026-07-25"`. Matched by `name_similarity_pending_review` (low automated confidence) but human-confirmed by Hud on 2026-07-29. |

**Timeline consistency check:** Viventium showed "New Hires" as of
2026-07-15; AxisCare's confirmed record shows `hireDate: 2026-07-13`,
`startDate: 2026-07-25` — internally consistent with each other and with
Hud's manual note. This is the same person.

**Classification: name match plus strong corroborating evidence** (exact
legal name, consistent hire timeline across three independent vendor
observations, one human-confirmed AxisCare link) — **not** an exact
email/phone match (the recruiting lead has neither on file), so per this
task's own matching rules this is `name_plus_corroborating_evidence`:
strong enough to *propose*, not strong enough to auto-resolve.

**Proposed resolution (not executed):**
1. Set `workforce_members.454d1069-....source_recruiting_lead_id = '0e5bc40a-...'`.
2. Set `recruiting_leads.0e5bc40a-....status = 'hired'` (existing canonical value — no new terminal state introduced).
3. Preserve every existing observation, collector run, and vendor identity link untouched — this is a status/link change only, never a deletion.

## Broader audit — all recruiting leads vs. all workforce members

Only 2 `recruiting_leads` rows and 17 `workforce_members` rows exist live.

| Recruiting lead | Classification |
|---|---|
| Bob MobileQATest (`2c857aca-...`) | Archived synthetic test record (see `docs/architecture/HIRING_PIPELINE_AUDIT.md`) — no workforce match exists or would be expected. |
| Alma Dhora Owolabi (`0e5bc40a-...`) | Probable workforce match, evidence-backed (above) — pending approval. |

The other 16 workforce members were checked by name against both
recruiting leads: **none match.** They were not sourced from Serve OS's
own recruiting pipeline at all (all 17, including Alma's, have
`source_recruiting_lead_id: null` — the other 16 were most likely hired
via AxisCare/Viventium directly, before or outside this recruiting
system). **Conclusion: exactly one recruiting lead needs reconciliation
right now** — not because only two rows happen to exist, but because the
other 16 workforce members have no corresponding recruiting-lead record
to reconcile against in the first place.

**Counts:** active recruiting lead with no workforce match: 0 (the only
other lead is already archived) · probable workforce match: 1 (Alma) ·
confirmed hired/converted: 0 · archived synthetic record: 1 (Bob) ·
conflicting vendor state: 0 · needs human review: 1 (Alma, pending
approval of the proposed resolution above).

## What was implemented (non-destructive)

- `lib/recruitingLeads/workforceResolution.ts` + tests (8/8) — the
  deterministic evaluation rule, matching this task's exact tier order:
  a confirmed structural link resolves outright; exact email/phone with
  an active workforce link resolves outright; name + corroborating
  evidence resolves but is flagged `requiresReview: true`; name alone
  never resolves.
- `RecruitingInbox`'s pipeline is already scoped to exclude `archived`
  from its default view/count (Workstream-1-era work, unchanged here).
  "Hired" was already one of its filter tabs before this investigation
  began — Alma would appear there once (and only once) the proposed
  resolution above is actually approved and applied.

## STOP — no production data changed

Per the mandatory pause: no `workforce_members` row, no
`recruiting_leads` row, and no `person_vendor_identity_links` row was
modified. The two-step resolution above (link + status change) is a
proposal, pending Hud's explicit approval of this specific record.
