# Serve Visit Intelligence — First-Week Observation Checklist

**Status:** Operating document. No code, scheduler, or database changes.
**Applies to:** `feature/financial-intelligence-v0.1` @ `26874919d04ce0bb95164c92288cd0d8dbf16c3c` — production schedule **not yet activated**.
**Use this document daily, without rereading the implementation.**

---

## 1. What the first week is for

Seven consecutive real production runs exist to validate — not assume:

1. production reliability (the job actually runs and completes);
2. idempotency under real recurring execution (not just two manual test runs);
3. supersession behavior under real, not synthetic, source changes;
4. identity-resolution completeness (resident/caregiver/Community coverage);
5. composite Visit-ID stability (`s=` vs `v=` — the open question from prior validation);
6. absence of duplicate current Facts;
7. correctness of the rolling `America/Chicago` window under real daily execution;
8. **whether the system is safe to trust for a broader historical backfill.**

The governing question for the week:

> Does one logical AxisCare Visit retain the same source identity as it moves through scheduled, in-progress, completed, corrected, verified, or removed states?

Do not assume the answer before the evidence is in.

---

## 2. Daily observation checklist

Fill one row per day. **Field source key:** ⚙ = read directly from the run's structured JSON result (logged by `app/api/scheduling/visit-facts-sync/route.ts`); 🔍 = requires a short supplementary read-only query (§10 lists exactly what to run) — **not yet a built-in field**, see §17 Known Gaps.

| Item | Source | What to record |
|---|---|---|
| Run status | ⚙ | succeeded / failed / partial (derive: `sync.available` + `sync.errors === 0`) |
| Run timestamp | 🔍 | wall-clock time of the run — **not currently in the structured result** (only `durationMs` is); read from the Netlify Function invocation log timestamp instead |
| Business window | ⚙ | `requestedWindow.startDate` → `requestedWindow.endDate` |
| Fetched | ⚙ | `sync.fetched` |
| Inserted | ⚙ | `sync.insertedNew` |
| Superseded | ⚙ | `sync.insertedSuperseding` |
| Unchanged | ⚙ | `sync.unchanged` |
| Errors | ⚙ | `sync.errors` (count only — no category is currently captured; see §17) |
| Truncated | ⚙ | `sync.truncated` |
| Unresolved resident count | ⚙ | `sync.skippedUnresolvedIdentity` |
| Unresolved resident rate | ⚙ (derived) | `skippedUnresolvedIdentity / fetched` — not pre-computed, divide the two logged numbers |
| Unresolved caregiver count | 🔍 | not in the sync result — see §10 query |
| Community-unresolved count | 🔍 | not in the sync result — see §10 query |
| `s=` IDs | ⚙ | `idStability.schedulePlaceholderCount` |
| `v=` IDs | ⚙ | `idStability.visitRecordCount` |
| Other ID shapes | ⚙ | `idStability.otherShapeCount` |
| Candidate continuity matches | ⚙ | `idStability.candidateContinuityMatches.length` |
| Exact `s=` ↔ `v=` candidate matches | ⚙ | `idStability.suspectedPlaceholderToVisitTransitions` |
| Ambiguous candidate matches | ⚙ (derived) | `candidateContinuityMatches.length − suspectedPlaceholderToVisitTransitions` (i.e., `v=`↔`v=` pairs) |
| Duplicate current Facts | 🔍 | not a built-in counter — structurally prevented by `historical_facts_current`'s `DISTINCT ON`, but verify with the §10 spot-check, not assumed |
| Notes | — | anything materially unusual, in your own words |

---

## 3. Daily health interpretation

No invented numerical alert thresholds — these are qualitative categories, not business-performance metrics.

**HEALTHY**
- Scheduled run succeeded, no truncation, no persistence errors.
- Unchanged Visits stayed no-ops (compare against the prior day's known-good count for the overlapping window).
- No duplicate current Facts.
- Any supersessions correspond to a source record that plausibly actually changed (not a mystery).

**REVIEW**
- Unexpected spike in inserts for a window that should mostly overlap prior days.
- Unresolved-identity rate rises noticeably day over day.
- A new candidate continuity match appears.
- The run partially completed, or pagination/status-mix looks unusual.

**STOP / INVESTIGATE BEFORE EXPANDING**
- Duplicate current Facts found.
- Repeated, unexplained supersessions on the same source record.
- Source retrieval failed outright, or the window was truncated.
- The same logical Visit is clearly represented as two unrelated current Facts (not just a candidate — an actually-confirmed case).
- Any persistence error.
- Community attribution looks wrong (e.g., activity attributed by caregiver home Community rather than service context).
- The Central-time window doesn't match what it should (§9).

---

## 4. ID-stability observation protocol

For **every** candidate continuity match surfaced by a day's run, log:

- business service date
- source ID A / source ID B (and any further ids, if more than two)
- shape of each id: schedule placeholder / visit record / other
- canonical resident ID (not a name)
- Community ID
- scheduled start / scheduled end
- service code/type
- caregiver reference, if present (id only)
- status of each record (`scheduled`/`completed`/`removed`/etc.)
- first-seen date / last-seen date
- whether both ids remain current, or one has dropped out of later fetches
- whether the later record appears to *replace* the earlier one (same fingerprint, later `recordedAt`, earlier one no longer appearing in fresh fetches)
- confidence classification (§5)

No names, no addresses, no free-text notes — ids and dates only.

---

## 5. Identity-stability classification (exact definitions)

- **NO EVIDENCE** — no meaningful candidate continuity between different source ids this run.
- **SUGGESTIVE** — two or more records plausibly represent the same logical service occurrence, but not enough to conclude identity mutation. *(This is where the baseline from the prior report already sits — 6 candidate matches, 1 of them an exact `s=`↔`v=` match, reproduced identically across two runs.)*
- **STRONG EVIDENCE** — multiple fields align closely across different ids and the temporal sequence (first-seen/last-seen, one disappearing as the other appears) strongly suggests one logical Visit changed source identity.
- **CONFIRMED** — a human has actually looked at the AxisCare source record(s), or a clear longitudinal sequence in our own data, and established that the same logical Visit changed source identity.

**Only CONFIRMED justifies changing the canonical Visit identity model.** A diagnostic fingerprint match alone — no matter how many times it recurs — can reach at most STRONG EVIDENCE, never CONFIRMED, without a human checking the actual AxisCare record.

---

## 6. What would trigger an identity-model review

The natural key stays exactly as implemented — `source_system` + `source_record_id` + `fact_type` — for the entire observation week, no exceptions.

A redesign should be **considered** only after CONFIRMED evidence, or repeated STRONG EVIDENCE, that one logical Visit changes AxisCare source ids. If that threshold is reached, the next steps are, in order:

1. pause any broader historical backfill;
2. retain all existing Facts exactly as they are;
3. document the specific examples (ids, dates, no PHI);
4. design a separate logical-Visit identity layer as a distinct proposal;
5. never rewrite historical provenance to "fix" it after the fact;
6. never retroactively merge Facts without a separately approved migration/reconciliation plan.

None of steps 4–6 happen automatically or during the observation week itself.

---

## 7. Duplicate current-Fact check — two different questions, do not conflate

**Natural-key duplicate (a system defect):** more than one row in `historical_facts_current` for the same `(source_system, source_record_id, fact_type)`. `historical_facts_current` guarantees one returned row per natural key in the view. The daily check verifies that underlying persistence and supersession behavior remain consistent with that expectation — not expected to ever fail, but confirmed rather than assumed. See §10 for the spot-check.

**Same-logical-Visit / different-source-ID candidate (a source-identity modeling question):** this is everything in §4/§5 — two *different* natural keys that a heuristic fingerprint suggests might be the same real-world Visit. This is expected to happen sometimes (baseline: 6 matches) and is not, by itself, evidence of a defect in this codebase — it's a question about AxisCare's own identifier behavior.

Report these as two separate line items every day. Never combine them into one "duplicates" count.

---

## 8. Supersession review (real, not synthetic)

For every real supersession observed in production this week, record:

- prior Fact id / new Fact id
- source record id
- which fields actually changed (e.g., `status`, `actualEnd`)
- old `recordedAt` / new `recordedAt`
- confirm `historical_facts_current` for that natural key returns only the newer row
- confirm a full-history query for that natural key still returns both rows, oldest first, original intact

The point is proving real source corrections behave exactly as the synthetic test and the two live dry runs already showed — not re-testing the mechanism, but confirming it holds under real, unplanned change. No PHI in the record — ids and field names only, never field *values* if they could be sensitive.

---

## 9. Time-window validation (daily)

Record, per run:

- today's `America/Chicago` business date
- `requestedWindow.startDate` / `requestedWindow.endDate`
- `utcWindow.startUtc` / `utcWindow.endUtcExclusive`

Confirm:

- the same civil dates drive both the AxisCare fetch and the Fact query (they do, by construction — `syncHistoricalVisitFacts` and the metric window both go through the Central-date-aware path now) — this is a sanity re-check, not a re-audit of the design.
- no off-by-one-day appears around a DST boundary (none expected this week — the next US DST transition is outside the observation week; still worth a glance since America/Chicago is IANA-driven, not hardcoded).
- the window is never, under any code path, silently UTC-midnight-based. If it ever is, that's a **STOP / INVESTIGATE** finding (§3), not a REVIEW one — the whole point of the prior slice was eliminating that failure mode.

---

## 10. Supplementary read-only queries (for the 🔍 fields above)

These are **not new permanent code** — short, ad hoc, read-only scripts a reviewer runs manually each day (the same throwaway-script pattern used throughout this workstream: write to `scripts/tmp-*.ts`, run once, delete). None of them write anything.

- **Unresolved caregiver count / Community-unresolved count:** call `getDeliveryHoursForBusinessDateRange(startDate, endDate)` for the day's window and read `rollup.byCaregiver.get(null)` and `rollup.byCommunity.get(null)` sizes/qualifying counts from the returned `records`/`rollup` — the exact same function already used for Metric #14.
- **Duplicate current-Fact spot-check:** query `historical_facts_current` for the day's window (`getCurrentFactsByTypeAndWindow`) and group in memory by `(provenance.sourceSystem, provenance.sourceRecordId, factType)`; any group with more than one row is the defect condition in §7. Expected result every day: none.

---

## 11. First-week summary table (fill progressively)

| Date | Status | Fetched | Inserted | Superseded | Unchanged | Errors | Unresolved resident % | `s=` | `v=` | Candidate matches | Confirmed transitions | Duplicate current Facts | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Day 1 | | | | | | | | | | | 0 | | |
| Day 2 | | | | | | | | | | | 0 | | |
| Day 3 | | | | | | | | | | | 0 | | |
| Day 4 | | | | | | | | | | | 0 | | |
| Day 5 | | | | | | | | | | | 0 | | |
| Day 6 | | | | | | | | | | | 0 | | |
| Day 7 | | | | | | | | | | | 0 | | |

("Confirmed transitions" defaults to 0 every day — it only ever changes via the human-review process in §5/§6, never automatically.)

---

## 12. End-of-week decision criteria

Classify into exactly one outcome after 7 runs:

**OUTCOME A — STABLE, READY FOR CONTROLLED BACKFILL.** Runs consistently succeeded; no duplicate current Facts; idempotency held; supersession behaved correctly on real changes; no CONFIRMED id mutation; Central-time semantics stayed correct; identity coverage stable/acceptable. → Proceed with bounded 30-day backfill chunks (per the prior backfill assessment), still monitoring unresolved-identity rate per chunk.

**OUTCOME B — OPERATIONALLY STABLE, IDENTITY QUESTION STILL OPEN.** Sync is reliable, persistence is correct, but ID continuity remains SUGGESTIVE or STRONG EVIDENCE, unconfirmed. → Continue forward observation before any broader backfill.

**OUTCOME C — CONFIRMED SOURCE-ID MUTATION.** A logical Visit is confirmed (§5) to have changed source identity. → Pause broad backfill; follow §6's steps; design canonical logical-Visit identity handling as a separate, explicitly approved effort before expanding history.

**OUTCOME D — PIPELINE INSTABILITY.** Duplicate Facts, unexpected supersessions, truncation, repeated failures, time-window defects, or Community-attribution defects. → Do not broaden deployment until corrected. This outcome can be reached on Day 2 as easily as Day 7 — don't wait out the week if it's already clear.

Reaching Day 7 is not, by itself, approval for anything. The outcome is decided by the evidence in the table, not the calendar.

---

## 13. Daily summary template (copy this each day)

```
## Visit Intelligence Daily Check — YYYY-MM-DD

**Run:** HEALTHY / REVIEW / STOP

**Window:** YYYY-MM-DD → YYYY-MM-DD America/Chicago

**Sync**
- fetched:
- inserted:
- superseded:
- unchanged:
- errors:
- truncated:

**Identity coverage**
- unresolved residents:
- unresolved resident %:
- unresolved/unassigned caregivers:
- non-Community:

**AxisCare ID stability**
- s=:
- v=:
- candidate continuity matches:
- exact s= <-> v= candidates:
- confirmed cross-ID transitions:

**Persistence**
- duplicate current Facts:
- real supersessions reviewed:

**Notable findings**
- (concise bullets only)

**Recommendation**
- continue normally / monitor specific issue / investigate before next run / stop expansion
```

---

## 14. End-of-week review template

```
## Week-One Visit Intelligence Review

### Reliability
### Idempotency
### Real Supersession Behavior
### Resident / Caregiver / Community Coverage
### AxisCare Source-ID Stability
### Central-Time Window Correctness
### Data-Quality Findings
### Remaining Risks
### Backfill Recommendation
### Final Classification: OUTCOME A / B / C / D
```

---

## 15. Scope boundaries — first-week observation does NOT authorize

- changing Historical Fact natural keys
- merging `s=` and `v=` records, under any circumstance, automatically
- deleting Historical Facts
- broad historical backfill
- Financial Facts
- Revenue/Labor calculations
- Signals or Rules
- Executive UI
- Viventium integration
- accounting integration

Observation first. Architecture change only after evidence — and even then, only CONFIRMED evidence, reviewed by a human, triggers a design conversation — never an automatic code change.

---

## 16. Relationship to the deployment gate

**Before activation** (not part of the daily checklist — a one-time pre-flight):
- verify `SCHEDULING_VISIT_SYNC_INTERNAL_SECRET` is set in the deployment environment
- verify the exact schedule (`0 7 * * *` UTC)
- verify the route/function path (`netlify/functions/scheduling-visit-facts-sync.mts` → `POST /api/scheduling/visit-facts-sync`)
- verify the expected rolling window (7 Central business days, today + 6 back)
- verify this branch has actually been deployed (the schedule does nothing until it is)

**During the first week:** execute §2–§13 daily.

**After the first week:** make exactly one explicit decision using §12's OUTCOME A–D — a deliberate, human, evidence-based call. Reaching Day 7 is not automatic approval for backfill or anything else.

---

## 17. Known gaps in current diagnostics (honest accounting)

The structured `RollingSyncResult` already logged by every run does **not** yet include:

1. **A wall-clock run timestamp** (only `durationMs` — a duration, not a point in time). Use the Netlify Function invocation log's own timestamp instead.
2. **Unresolved caregiver count** and **Community-unresolved count** as first-class fields — both are derivable today via `getDeliveryHoursForBusinessDateRange()`'s existing `rollup.byCaregiver`/`byCommunity` null-key groups (§10), just not pre-computed into the sync result itself.
3. **Error categorization** — `sync.errors` is a count only; no error-type/message breakdown is captured per run today.
4. **A dedicated "duplicate current Fact" counter** — not needed for correctness (the view's `DISTINCT ON` already structurally prevents it), but there's no automatic daily assertion of that fact today; §10's spot-check query fills this gap manually.

None of these are correctness defects — they're just not pre-computed into the log line yet. This document works around all of them with a supplementary read-only query rather than proposing a code change, per this task's scope. If the first week's manual workarounds prove tedious, adding these as first-class fields to `RollingSyncResult` would be a small, separate, explicitly-approved follow-up — not assumed here.
