# Hiring Pipeline Audit — Post-Release Stabilization, Workstream 3

Read-only audit against the live `recruiting_leads` table and every related
evidence table (`recruiting_lead_observations`, `_collector_runs`,
`_human_confirmations`, `_vendor_identities`, `_inferences`,
`_desired_state_evaluations`), via read-only PostgREST introspection with
the service-role key. **No row was modified, archived, or deleted to
produce this report.**

## Result: the live pipeline has exactly two records

This is a much smaller pipeline than the task anticipated — there is no
large backlog of synthetic/duplicate/stale records to clean up. Both
records are classified individually below, with full supporting evidence.

## Classification

| ID | Name / contact | Source | Created | Related evidence | Current status | Classification | Proposed action |
|---|---|---|---|---|---|---|---|
| `2c857aca-fe26-41e8-aefd-02d7a5d1cf14` | "Bob MobileQATest" · hudsonkeel@gmail.com · (512) 855-1119 | `homepage_conversation` | 2026-07-05 | 2 collector runs (Apploi + Viventium, both `match_status: not_found`); 0 observations; 0 vendor identity links; 0 human confirmations; 0 desired-state evaluations | `archived` | **Obvious synthetic/test.** Name literally contains "MobileQATest," message reads "Mobile QA Teat," uses the repository owner's own email, and both vendor-matching attempts found nothing. | **No action required — already archived.** Fully isolated (referenced by nothing except its own 2 collector-run rows, both terminal/`success`). Eligible for hard deletion *if* Hud wants it removed entirely, since it is fully isolated with no cascading references — but not deleted here. See "Records eligible for deletion" below; requires explicit approval per the mandatory stop condition. |
| `0e5bc40a-e5f0-4e90-84d0-b46841da971a` | "Alma Dhora Owolabi" · no email/phone on file | `manual_vendor_reconciliation` | 2026-07-21 | 2 collector runs (Apploi, both `match_status: found`); 5 observations (candidate name, position, resume availability, Apploi-side Viventium-integration check, application-exists); 1 vendor identity link (`is_human_confirmed: true`, linked by `hudso`); 0 human confirmations rows; 7 desired-state evaluations (2 satisfied, 3 unknown, 2 not_applicable/gated) | `in_review` | **Confirmed real applicant, genuinely unresolved.** Created deliberately by Hud (`raw_submission.manual_reconciliation_note` explains exactly why: observed in Apploi with "Requested Interview" status and in Viventium's "New Hires" area as of 2026-07-15, with no Serve OS website application on file). No email/phone is expected and documented, not a data-quality defect. | **No cleanup action. Flag for human follow-up.** The system's own automated observation (`apploi.viventium_integration_status = no_integration_record_found`, collected 2026-07-21) does not corroborate Hud's manual note that Viventium already shows this person in "New Hires" — a real, worth-surfacing discrepancy, not something to resolve automatically. The evidence is also 2+ weeks old as of this report; recommend a fresh Apploi/Viventium check to confirm current status before any status change. |

**Counts by category:** confirmed real applicant: 1 · obvious synthetic/test: 1 · probable duplicate: 0 · malformed/incomplete: 0 · stale but legitimate: 0 · rejected/withdrawn: 0 · unresolved: 1 (the same record as "confirmed real applicant" — real and still pending, not two separate records).

## Records eligible for deletion (STOP — not executed, pending approval)

Per the mandatory stop condition: only one record is even a deletion
candidate, and it is not deleted here.

- **`2c857aca-fe26-41e8-aefd-02d7a5d1cf14`** ("Bob MobileQATest")
  - **Foreign-key/application references:** two rows in `recruiting_lead_collector_runs` (`0eb680bc-...`, `f955ca65-...`) reference this lead's ID via `recruiting_lead_id`. No rows in `recruiting_lead_observations`, `_human_confirmations`, `_vendor_identities`, `_inferences`, or `_desired_state_evaluations` reference it. No other table in the schema was found to reference `recruiting_leads.id`.
  - **Exactly what would be removed:** the 1 `recruiting_leads` row, plus its 2 dependent `recruiting_lead_collector_runs` rows (assuming a cascading delete; see below).
  - **Cascade behavior:** not verified against the live schema in this read-only pass (would require inspecting the actual `ON DELETE` clause on `recruiting_lead_collector_runs.recruiting_lead_id`'s foreign key, which requires `pg_catalog` access not available via this method). **Must be confirmed before any deletion is executed.**
  - **Rollback/backup approach:** none performed — no deletion was executed. If approved, the safe approach is to export both rows (`recruiting_leads` + the 2 `recruiting_lead_collector_runs` rows) to a JSON snapshot immediately before deletion.
  - **Approval status: NOT APPROVED.** Do not delete this record ID, or any other, without Hud's explicit, itemized approval of this exact ID.

## What was implemented (non-destructive only)

1. **No new lifecycle column was added.** `recruiting_leads.status` already includes `"archived"` as a first-class value (confirmed live and already in use by the one synthetic record above) — this is the "safe mechanism [that] already exists" the task asks to prefer over inventing a new one.
2. **`components/recruiting/RecruitingInbox.tsx`** — the default "All" tab and its count previously included archived records, inflating what looked like real pipeline volume. Now "All" means the operational pipeline (archived excluded from both the list and the count); the existing "Archived" tab is unchanged and remains the explicit way to view archived records — nothing is hidden, only kept off the default surface.
3. **No record was archived, corrected, consolidated, or deleted.** Both existing records were left exactly as found; the one already-archived record needed no further action.
