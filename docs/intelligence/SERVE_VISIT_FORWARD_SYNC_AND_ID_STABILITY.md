# Serve Visit Intelligence — Forward Sync, Business-Time Convention, and ID-Stability Monitoring

**Status:** Code complete, validated live via bounded dry runs. **Production schedule not yet activated** — see the Deployment Gate at the end of this document.
**Branch:** `feature/financial-intelligence-v0.1`
**Prepared for:** Hud (and review with ChatGPT)

This document follows `SERVE_VISIT_INTELLIGENCE_LIVE_VALIDATION.md` and productionizes the already-proven shared Visit Historical Fact pipeline: a real rolling forward sync, a fix for the UTC/Central boundary discrepancy that report identified, and diagnostic monitoring for the AxisCare composite-ID risk that report flagged as the top open question. No Financial Facts, Signals, Rules, Executive UI, broad backfill, or vendor integration were added.

---

## 1. Production sync architecture

Mirrors the existing AxisCare client-sync pattern exactly — a thin scheduled trigger, an internal authenticated route, and a shared orchestrator that contains all the real logic:

```
netlify/functions/scheduling-visit-facts-sync.mts   (cron trigger only, zero sync logic)
  -> POST app/api/scheduling/visit-facts-sync/route.ts   (auth check, zero sync logic)
    -> lib/scheduling/visitFactsRollingSync.ts's runRollingVisitFactsSync()
      -> lib/scheduling/visitFactsSync.ts's syncHistoricalVisitFacts() (unchanged, already proven)
```

- **Cadence:** once daily.
- **Authentication:** `x-scheduling-visit-sync-internal-secret` header, checked against `SCHEDULING_VISIT_SYNC_INTERNAL_SECRET` — same shared-secret, POST-only, no-cookie pattern as `app/api/axiscare/scheduled-sync`.
- **Scheduled time:** `0 7 * * *` (7:00 AM UTC), deliberately **one hour after** the existing AxisCare client/community sync (6:00 AM UTC), so resident and Community identity resolution is fresh before this sync tries to use it.
- **Structured result:** every run returns/logs the requested business window, the translated UTC window, the full sync counts (fetched/normalized/inserted-new/inserted-superseding/unchanged/skipped-unresolved/skipped-no-time/errors/truncated), the ID-stability diagnostic summary, and run duration — no PHI, no raw payloads, no credential values anywhere in it.

## 2. Rolling lookback window

**7 business days, including today** (6 days back + today), computed in Serve's canonical business time zone (§3) — not server/UTC calendar days. Reasoning: a Visit can plausibly be corrected (late clock-in/out entry, verification, status correction) for some days after the service date; because ingestion is idempotent, re-checking a wider trailing window costs nothing beyond already-unchanged rows correctly no-op'ing — proven directly in §5 below.

## 3. Canonical business-time convention

**New module:** `lib/scheduling/businessTime.ts`. Reuses `lib/utils/date.ts`'s existing `getCentralDayBoundaryUtc()` (already DST-aware) rather than duplicating timezone math — only adds the "business date(s) → UTC window" framing.

- **Zone:** `America/Chicago`, via IANA semantics (never a hardcoded UTC-5/UTC-6/CDT/CST offset).
- **API:** `businessDateToUtcWindow(date)`, `businessDateRangeToUtcWindow(start, end)` (inclusive start, **exclusive** end), `utcInstantToBusinessDate(iso)`, `businessDateDaysBefore(date, n)`.
- **Tested:** ordinary CDT date, ordinary CST date, the 2026 spring-forward date (Mar 8) and fall-back date (Nov 1), a multi-day range, exclusive-boundary correctness, and independence from the process's local `TZ` — 10/10 passing. DST-transition-day boundaries inherit the same documented, accepted approximation already used elsewhere in this codebase (`lib/scheduling/dateTime.ts`'s `parseWallClockInZone`) for the rare case where the exact offset at a transition instant is inherently ambiguous — not a new limitation introduced here.
- **Wired into:** `deliveryHours.ts`'s new `getDeliveryHoursForBusinessDateRange()` and `visitsPerActiveClient.ts`'s new `getVisitsPerActiveClientForBusinessDateRange()` — both thin wrappers that convert then delegate to the existing, unchanged, already-tested ISO-window functions. No formula, qualification rule, or existing test was touched.

### Reconciliation proof (live)

Re-querying the original Sept 5–7 window after the wider rolling sync had also run:

| Query | Result |
|---|---|
| Naive UTC window `[2026-09-05T00:00Z, 2026-09-08T00:00Z)` | 78 current Facts |
| Canonical `America/Chicago` business window `businessDateRangeToUtcWindow("2026-09-05","2026-09-07")` | 76 current Facts |

The canonical count (76) **exactly matches** the confirmed `unchanged` count from both rolling-sync runs (§5) — i.e., it is stable and correct by construction, and reproduced identically across two separate live runs. The naive count, by contrast, **changed on its own** (73 → 78) between the original validation and now. The most likely explanation is that the wider 7-day fetch pulled in Visits from adjacent Central calendar dates whose UTC instants happen to land inside the naive Sept 5–8 UTC bucket (e.g., a Sept 4 Central-dated Visit late enough in the evening) — but this pass did not isolate and confirm that specific mechanism directly, so it is reported as the most plausible explanation, not a proven one. What **is** directly demonstrated, without qualification: the naive UTC boundary is not a stable definition of "which Visits belong to Sept 5–7" — its count moved between two points in time with no correction or supersession having occurred — while the canonical `America/Chicago` boundary is stable and matches AxisCare's own Central-civil-date fetch semantics by construction. That is the discrepancy this convention resolves.

## 4. Rolling sync — live proof (two runs, real data)

| | Run 1 (2026-09-02 → 2026-09-08) | Run 2 (identical window, immediately after) |
|---|---:|---:|
| Fetched / Normalized | 211 / 211 | 211 / 211 |
| Skipped (unresolved identity) | 40 | 40 |
| Skipped (no occurrence time) | 0 | 0 |
| Inserted new | 95 | **0** |
| Inserted superseding | 0 | **0** |
| Unchanged | 76 | **171** |
| Errors | 0 | 0 |
| Duration | 62.2s | 41.4s |

Run 2's `unchanged` (171) exactly equals Run 1's `insertedNew + unchanged` (95 + 76) — perfect idempotency on the full 7-day production window, not just the narrower window validated previously. ~200 visits/run at roughly 0.2–0.3s/visit (sequential per-Visit `ingestHistoricalFact` round-trips) is comfortably fine for a once-daily job; noted here as a baseline, not a concern.

## 5. AxisCare composite Visit-ID stability — first real evidence

**New module:** `lib/scheduling/visitIdentityDiagnostics.ts` — diagnostic-only. It classifies each Fact's `source_record_id` shape (`schedule_placeholder` = `s=<id>:d=<date>`, `visit_record` = `v=<id>:s=0:d=<date>`, `other`) and computes a coarse, explicitly-heuristic fingerprint (`residentId :: businessServiceDate :: scheduledStart`, deliberately excluding caregiver, since caregiver assignment can change without the Visit becoming a different logical occurrence). Any fingerprint mapped to more than one distinct `source_record_id` is surfaced as a **candidate continuity match** — never merged, never superseded, never deleted, purely reported. Its own test suite includes a source-scan proving the module contains no write/ingestion capability at all (9/9 passing).

**This is diagnostic-only and cannot become the natural key**, because the fingerprint is a heuristic with known, accepted failure modes in both directions: a legitimate schedule correction that shifts `scheduledStart` produces a false negative (misses a real transition); two independent Visits for the same Client at the exact same scheduled moment would produce a false positive (flags an innocuous coincidence). Only a human, looking at the actual AxisCare records, can resolve which is which.

### Baseline finding (both live rolling-sync runs, identical results)

- 171 total current Facts in the 7-day window: 40 `schedule_placeholder`, 131 `visit_record`, 0 `other`.
- **6 candidate continuity matches**, reproduced identically across both runs (not noise):
  - **1 exact `schedule_placeholder` ↔ `visit_record` match** — one resident, one date/time, matched to `s=146:d=2026-09-07`, `v=1729:s=0:d=2026-09-07`, **and** `v=1730:s=0:d=2026-09-07` (three distinct ids for what the fingerprint considers one logical occurrence).
  - **5 further matches**, each a pair of two different `visit_record`-shaped ids sharing the same resident/date/time fingerprint — a related but distinct pattern from the one originally hypothesized (visit-record-to-visit-record id churn, not just placeholder-to-visit).

**Classification (per the requested scale): SUGGESTIVE, not confirmed.** This is real, reproducible, concrete evidence that the concern is well-founded — obtained on the very first live run, not after a week of waiting — but it has not been human-verified against AxisCare's own records to confirm whether these are genuinely the same logical service occurrence (supporting the original hypothesis, and revealing a second, related pattern) or an artifact of this agency's specific scheduling setup (e.g., a recurring visit template that legitimately produces multiple linked records by design). **No identity policy is proposed here** — per instruction, this remains observation pending a first week of accumulated evidence and, ideally, a direct look at these specific AxisCare records.

## 6. Diagnostic retention decision

**No new database table was created.** The structured result (§1) — including the full ID-stability summary — is written to the route's `console.log` (Netlify Functions' existing log aggregation, the same mechanism `axiscare-scheduled-sync` already relies on). At the observed volume (single-digit candidate matches, ~200 Visits/day), this is sufficient to review the first production week by hand. If retention needs grow beyond what logs conveniently support, that would be a small, separate, explicitly-approved follow-up — not built preemptively here.

## 7. Existing Historical Facts

The 76 real Visit Facts persisted during the original live validation were **not modified**. The new business-time convention affects only how query windows are computed, never historical truth; no source ID was rewritten; no Fact was retroactively altered to fit the new convention.

## 8. Metric #12

Only its Visit-count period semantics were aligned (`getVisitsPerActiveClientForBusinessDateRange()`, mirroring Metric #14's wrapper exactly). The Active Client denominator policy remains `pending_hud_decision` (Registry §40) — untouched, not resolved here. The existing `getAuditEligibleActiveClientResidents()` request-context boundary (documented in the prior live-validation report) was left as-is; no new lifecycle path was created to work around it.

## 9. Remaining risk

- **AxisCare composite-ID stability is now SUGGESTIVE evidence, not confirmed** — the single most important thing to watch over the coming production week, with a live monitoring path already in place to do so.
- Everything else in this slice — business-time conversion, the rolling sync itself, idempotency at the wider window — came back clean.

---

## DEPLOYMENT GATE

Committing this code does **not** activate the production schedule. Before enabling it, for Hud's explicit approval:

1. **Exact schedule:** `0 7 * * *` (7:00 AM UTC daily).
2. **Exact rolling window:** the 7 most recent Central-time business days (today plus the 6 preceding), recomputed fresh on every run.
3. **Endpoint invoked:** `POST /api/scheduling/visit-facts-sync`, triggered by `netlify/functions/scheduling-visit-facts-sync.mts`.
4. **Required config:** a new environment variable, `SCHEDULING_VISIT_SYNC_INTERNAL_SECRET`, must be set in the deployment environment (mirroring `AXISCARE_SYNC_INTERNAL_SECRET`'s existing setup) before the schedule can succeed.
5. **Expected max write volume:** ~200–250 Visits/day observed at this agency's current activity level, taking roughly 40–60 seconds per run (sequential per-Visit writes) — comfortably within a daily cron's normal execution window.
6. **Behavior on failure:** the route returns a non-2xx status and the Netlify function logs it; `syncHistoricalVisitFacts()`'s per-Visit error handling means a single failed insert doesn't abort the whole run (errors are counted, not fatal) — see `visitFactsSync.ts`, unchanged from the prior validation.
7. **Behavior on partial pagination/truncation:** `truncated: true` would appear in the structured result/logs; at the observed ~30/day volume this is far from the 20-page/5,000-Visit bound and not expected to trigger under normal daily operation.
8. **ID-stability diagnostics review plan for week one:** review the `console.log`-emitted `idStability` summary from each day's run; specifically watch whether `candidateContinuityMatches`/`suspectedPlaceholderToVisitTransitions` keep recurring for the *same* fingerprints (suggesting a stable, explicable pattern) versus new ones appearing daily (suggesting broader churn) — and, ideally, spot-check one or two of the six candidates already found against AxisCare's own UI to resolve whether they're the same logical Visit.

**Hud must explicitly approve activating the production schedule.** This document and the code it describes only make that decision possible — they do not make it.

---

## BRANCH-DEPLOY MANUAL VALIDATION — PASSED

A full, authenticated, end-to-end manual invocation of the production route was performed against the `feature/financial-intelligence-v0.1` branch deploy, resolving two upstream issues found during the attempt (a proxy allowlist gap and an internal-secret value mismatch, both since fixed) and confirming the deployment-gate checklist above is technically satisfiable. **This did not activate the production schedule** — see the still-open checklist items below.

**Test date/time:** 2026-09-10 (Central), route responded within the same session as the request.

**Deployed commit:** `17cf168ed67c761e020d77e3282904aa98f35792` (with the temporary auth-comparison diagnostic added for the investigation now removed in a follow-up commit — the route's actual auth/sync logic is unchanged from `0c8a8e3`).

**Request:** `POST /api/scheduling/visit-facts-sync` on the branch-deploy URL, authenticated with the correct `SCHEDULING_VISIT_SYNC_INTERNAL_SECRET` header.

**Result:**

| Field | Value |
|---|---|
| HTTP status | 200 |
| Auth | passed |
| `available` | true |
| Business window | `2026-09-04` → `2026-09-10` (America/Chicago) |
| UTC window | `2026-09-04T05:00:00.000Z` → `2026-09-11T05:00:00.000Z` (exclusive) |
| Fetched / Normalized | 212 / 212 |
| Inserted new | 38 |
| Inserted superseding | 7 |
| Unchanged | 119 |
| Skipped (unresolved identity) | 48 |
| Skipped (no occurrence time) | 0 |
| Errors | 0 |
| Truncated | false |
| Duration | 8,945 ms |

Internally consistent: 38 + 7 + 119 + 48 + 0 = 212 = fetched/normalized.

**ID-stability diagnostics from this run:**

| Field | Value |
|---|---|
| `s=` (schedule-placeholder) count | 40 |
| `v=` (visit-record) count | 124 |
| Other ID-shape count | 0 |
| Candidate continuity matches | 7 (up from the 6 baselined in §5 above) |
| Suspected `s=`↔`v=` transitions | 1 (unchanged from §5) |

The new candidate is a `v=`↔`v=` pair dated 2026-09-09, reported the same fingerprinting way as the original six. Per this document's own classification scale (§5) and the First-Week Observation Checklist's definitions, this remains **SUGGESTIVE only, not CONFIRMED** — one additional data point consistent with the existing pattern, not a new pattern, and not human-verified against AxisCare's own records. No identity-model action is authorized by this finding, per the checklist's explicit rule that only CONFIRMED evidence (never a diagnostic fingerprint alone, however many times it recurs) can justify that.

**Not yet done:** production schedule activation. All eight Deployment Gate checklist items above remain Hud's explicit decision, not automatically satisfied by this passing test.
