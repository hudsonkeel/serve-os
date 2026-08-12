# Audio Transcription Pipeline — Architecture Note

Narrow slice: captured assessment audio → automatic transcription → transcript segments →
the existing, already-governed assessment extraction pipeline (docs/architecture/
ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md). Branch: `feature/audio-transcription-pipeline`
(serve-os). This is a **work-in-progress status note**, not a completion report — see §6 for
what is proven vs. not yet proven, and §7 for the one open cross-repo finding this depends on.

## 1. Trigger flow

```
serve-intake-mvp (Capture PWA + Netlify Functions)          serve-os (this repo)
─────────────────────────────────────────────────           ────────────────────
mobile mic → chunked upload to intake-audio bucket
  (existing, unchanged — Vertical Slice 1/2)
        │
        ▼
intake-finish.js marks source 'uploaded',
session 'processing'  ──── POST (shared secret) ───►   app/api/intake/transcribe/route.ts
        │                                                       │
        │  (best-effort, bounded timeout,                       ▼
        │   never fails the Finish response)          transcribeAndExtractAssessmentAudio()
        │                                                       │  1. PHI gate check (fail closed)
        ▼                                                       │  2. download chunks from storage
Finish response returns to the client                           │  3. transcribe each chunk (OpenAI)
regardless of transcription outcome                              │  4. write intake_transcript_segments
                                                                  │  5. update intake_sources.transcript_text
                                                                  │  6. run the EXISTING extraction
                                                                  │     pipeline (unchanged) — same
                                                                  │     path pasted-transcript already uses
                                                                  ▼
                                                        session → 'needs_review' or 'draft'
                                                        (same review/approval/pricing/AxisCare/
                                                        Cinch flow as before — untouched)
```

The extraction pipeline itself required **zero changes** — this was the entire point of the
source-agnostic transcript boundary designed in the prior phase (`getCombinedTranscriptText`
reads `intake_sources.transcript_text` regardless of how it was populated). The only new work is
everything upstream of that column being filled in automatically instead of by hand.

## 2. PHI governance gate

`lib/assessmentIntelligence/phiGovernance.ts` — a single enforcement point. Real captured audio
must not reach OpenAI until a human has confirmed the BAA is executed **and** Modified Retention
is provisioned. This is implemented as a fail-closed environment flag,
`PHI_OPENAI_PROCESSING_CONFIRMED`, checked before any network call:

- Unset (the current, correct state) → every entry point returns/throws immediately, before
  touching storage, OpenAI, or even the database in the webhook path.
- Must be the exact string `"true"` — no truthy-string leniency (`"1"`, `"yes"`, `"TRUE"` all
  fail closed; tested explicitly).
- **This flag is never set by application code.** Only a human sets it, after confirming both
  conditions outside this codebase. It is not inferred from `OPENAI_API_KEY`'s presence — that
  only proves a credential exists, not that it's cleared for PHI.

As of this branch, **this flag remains unset**. Nothing in this slice can process real captured
audio yet, by construction — not by policy alone.

## 3. Known limitations (documented, not oversights)

- **Per-chunk transcription, no cross-chunk context.** Each uploaded `.webm` chunk is
  transcribed independently via `openai.audio.transcriptions.create`. Concatenating the raw
  chunk bytes first and transcribing once was considered and rejected: WebM/Matroska containers
  are not safely concatenable by naive byte-appending, so this would risk a corrupt or
  unparseable file. The tradeoff is real: a word split across a chunk boundary may transcribe
  worse than it would with full-file context. Acceptable for a first slice; a smarter chunking
  or reassembly strategy is a reasonable future improvement, not required now.
- **Synchronous webhook call.** `intake-finish.js` calls serve-os's `/api/intake/transcribe`
  and awaits it (with a bounded timeout) rather than firing-and-forgetting, because Netlify
  Functions' execution environment is not guaranteed to keep running after the response is
  sent — an unawaited call could simply never complete. This means Finish's response time now
  includes transcription time. For a handful of short chunks this is seconds, not minutes, but
  at real scale this should move to a proper queue/background job, not a synchronous function
  call. Flagged, not solved, in this slice.
- **No diarization.** Segments have no `speaker` value (column exists, left null). The OpenAI
  SDK installed here (`openai@^6.41.0`) exposes a diarized transcription mode
  (`TranscriptionDiarized`) that could fill this in later without a schema change.
- **`intake_sources.status` has no "transcribed" state.** Rather than add another migration,
  completion is signaled by `transcript_text IS NOT NULL` on the `live_audio_stream` source row.
  Considered sufficient for this slice; revisit if a dedicated status value becomes genuinely
  necessary.

## 4. New configuration required (names only — no values set by me except where noted)

| Variable | Site | Purpose | Status |
|---|---|---|---|
| `INTAKE_TRANSCRIBE_WEBHOOK_SECRET` | serve-os (`os-servecaregiving`) **and** serve-intake-mvp (`serve-intake`) — same value on both | Shared secret authenticating the cross-repo webhook call | **Configured** — generated by me (a fresh internal secret with no pre-existing external account), value never displayed |
| `SERVE_OS_TRANSCRIBE_WEBHOOK_URL` | serve-intake-mvp | Target URL for the webhook call | **Configured** — `https://os-servecaregiving.netlify.app/api/intake/transcribe` |
| `PHI_OPENAI_PROCESSING_CONFIRMED` | serve-os | The production governance gate (§2) | **Not set — correct current state.** Only the user sets this, after confirming the BAA and Modified Retention |
| `PHI_SYNTHETIC_TEST_MODE` | local/ephemeral only, never persisted to any Netlify site | The synthetic-test override (§8) | Set only transiently for validation script runs on this machine — never configured on any deployed environment, and never should be |

## 5. Files changed (serve-os, this branch)

- `lib/assessmentIntelligence/phiGovernance.ts` — new, the gate
- `lib/assessmentIntelligence/transcription.ts` — new, per-chunk OpenAI transcription
- `lib/assessmentIntelligence/pipeline.ts` — new, shared extraction-pipeline tail (refactored
  out of `submitPastedTranscriptAndExtract`, now used by both the pasted-transcript admin path
  and the new automatic audio path) + the service-to-service audio entry point
- `lib/data/assessmentIntelligence.ts` — added storage/segment read-write functions
- `app/api/intake/transcribe/route.ts` — new webhook receiver, shared-secret auth
- `lib/actions/assessmentIntelligence.ts` — refactored to call the shared pipeline helper;
  behavior for the existing pasted-transcript path is unchanged
- `components/residents/AssessmentSection.tsx` — "Paste Transcript" relabeled and described as
  an admin/test fallback, not the normal operator workflow, per explicit instruction
- Five new/updated test files (`phiGovernance`, `transcription`, `pipeline` — see §6)

## 6. What is proven vs. not yet proven — SUPERSEDED, see §8

§6/§7 as originally written (below, struck through in spirit not in markdown) predate the
synthetic pre-merge validation pass. Both are now resolved:
- The serve-intake-mvp reconciliation finding (§7) is fixed — see its own commit
  (`54ec977`, serve-intake-mvp `main`) and the chat record of that work.
- Every "not yet proven" item in the original §6 has since been proven live, against real
  fabricated (non-PHI) audio — see §8.

The original text is kept below for the historical record of what this branch's state was
before validation.

**Originally proven** (automated tests, `tsc --noEmit` 0 errors, full production build succeeds,
`/api/intake/transcribe` registers as a route): the PHI gate fails closed by default and for any
near-miss value at every entry point; chunk-path parsing/ordering logic is correct; the
refactored pasted-transcript path still typechecks and builds cleanly.

**Originally not yet proven:** an actual transcription call against the real OpenAI audio API;
the full webhook round trip from a real `intake-finish.js` invocation; storage download/list
against a session with real uploaded chunks. See §8 for how each of these was subsequently
proven using only synthetic, non-PHI audio.

## 7. Reconciliation finding — RESOLVED (2026-08-11)

While preparing to wire `intake-finish.js`, discovery found that **the entire capture pipeline
in `serve-intake-mvp`** (`netlify/functions/*.js`, `public/capture/*`, and the architecture docs
describing it) **had never been committed to that repository** — confirmed via
`git log --all -- netlify/ public/capture/`, zero results on every branch at the time. It was
live in production only because every deploy so far used direct CLI upload (`netlify deploy`),
bypassing git entirely.

Fixed via a dedicated reconciliation commit on `main` (`54ec977`) containing exactly the
already-tested, already-live files — explicitly excluding `saved-outputs/` (local files that may
contain real client/resident data, never committed, now gitignored), `.vercel/` (local link
metadata, self-documented as never-commit, now gitignored), and an unrelated `package.json`
script change (left uncommitted). Verified: `node --check` clean on every file; a direct CLI
deploy makes the live site's content match the commit exactly; the new-prospect capture flow
re-run end-to-end against production behaves identically to before; all test data cleaned up.
Git-triggered auto-deploy for this site remains blocked on a separate, one-time manual step —
see §9.

The `intake-finish.js` transcription-trigger change was then added as its own separate, narrow
commit (`7ee47ab`) on top of the clean baseline, exactly as planned.

## 8. Synthetic pre-merge validation (2026-08-11/12)

Full validation of the actual code introduced by both feature branches, using only fabricated,
non-PHI audio, with the production `PHI_OPENAI_PROCESSING_CONFIRMED` gate left untouched
(confirmed still unset throughout). A new, separately-flagged `PHI_SYNTHETIC_TEST_MODE`
override (§2, added this pass) allowed the real transcription code path to run against this
fabricated audio without weakening the production gate — the production webhook route never
passes this override, and the override itself requires its own distinct flag value, proven by a
dedicated test that setting the production flag alone does **not** satisfy it and vice versa.

**Synthetic fixture**: a fabricated conversation between a fictional "Assessor" and "Daughter"
about a fictional resident, "Dorothy Whitfield" — covering mobility (walker, two falls), bathing/
dressing assistance, an explicit negative (hearing — "fine, no concerns"), vision (macular
degeneration), a mild memory/cognitive concern, family contact (daughter Karen, decision-maker;
uninvolved out-of-state brother), service preference (a few visits/week, ~1 hour, bathing +
light housekeeping), and several domains deliberately never mentioned (allergies, DNR, wandering,
medication reminders, desired start timing). Synthesized to audio via OpenAI TTS
(`gpt-4o-mini-tts`) from this fabricated script — no real resident's voice, name, or data was
used anywhere in this process. Segmented into 5 real WebM/Opus chunks (~20s each, ffmpeg
`libopus`) matching the actual production chunk format and naming convention
(`{index}.webm`), for a ~99-second fixture.

### 8.1 Transcription result — PASS

Real `openai.audio.transcriptions.create` calls (`gpt-4o-transcribe`) against all 5 chunks
succeeded. `intake_transcript_segments`: 5 rows persisted, one per chunk, in order.
`intake_sources.transcript_text`: populated (1,729 characters), assembled from the segments by
the actual pipeline code — not manually supplied or repaired.

### 8.2 Downstream extraction — PASS, genuinely transcript-driven

The assembled transcript (and only the assembled transcript) was fed into the unmodified
`extractFactsFromTranscript` → 21 draft facts persisted, 0 rejected. Correctly captured:
walker/recent falls, bathing/dressing assistance, hearing explicitly negative
(`confirmed_no`), vision impairment + named diagnosis, memory-change signals, both contact-person
fields, service frequency/duration, and relationship-intelligence fields (motivation, caregiver
stress). Exception review: 0 conflicting, 0 uncertain, 4 `missing_required` (fields never
mentioned in the fixture — correctly absent as rows, never fabricated). All 21 clear facts
approved; approved-facts count matched; the original 21 draft rows were confirmed unchanged
afterward (draft and approved tables independently correct). Deterministic pricing computed from
the approved, transcript-derived facts: correctly returned `pricing_review_required` (the
fixture's stated "an hour each time" exceeds the 45-minute published maximum) — not a
manufactured rate.

### 8.3 Transcription quality — material findings

Compared word-for-word against the source script:
- **Chunk-boundary word loss (2 instances)**: "her mobility has really **[declined]**" and "her
  hands aren't as **[steady as they used to be]**" — the bracketed words never appear anywhere in
  the transcript. Both losses land exactly at a chunk boundary, consistent with the documented,
  known limitation (§3) that each chunk is transcribed with no cross-chunk context. Neither loss
  changed the meaning of the resulting extracted fact (both topics were still correctly captured
  from surrounding context) — but this is fixture-specific luck, not a guarantee.
- **A short trailing utterance missing entirely**: the fixture's final line ("Not that I can
  think of right now.") does not appear in the transcript at all, despite the final chunk's
  duration (18.76s) appearing sufficient to contain it. Root cause unconfirmed — could be TTS
  pacing/synthesis compressing that line, or a genuine ASR omission of a short trailing
  utterance; not enough evidence to say which. Reported honestly rather than guessed at. Notably,
  its absence did **not** cause a fabricated fact — no row was created for it, correctly.
- **One minor word drop**: "lives out **[of]** state" — "of" dropped, again at a chunk boundary.
  Low impact, meaning still clear.
- **One proper-noun error**: "Serve" transcribed as "Serv" once. Low impact, cosmetic.
- **One dropped speaker label**: one "Daughter:" tag missing before a line (the line's content
  itself was still transcribed correctly and attributed correctly downstream).
- **No hallucinations found** — nothing in the transcript was invented; every discrepancy found
  was an omission, never fabricated content.
- **Punctuation/capitalization**: consistently correct throughout.

Assessment: sufficient fidelity for safe downstream extraction in this run — every safety-
relevant fact (falls, mobility, ADL needs, explicit negatives) survived intact, and no omission
produced a fabricated fact. The chunk-boundary word-loss pattern is real and should inform future
work (e.g., small chunk overlap) but is not a blocker for this narrow slice.

### 8.4 Failure and retry behavior — PASS, 6/6 required checks

| Check | Result |
|---|---|
| PHI gate closed → refuses (via the real HTTP webhook route, not just the underlying function) | PASS — `200` with `phiGateBlocked:true`, no OpenAI call attempted |
| Invalid webhook secret → rejected | PASS — missing header and wrong value both `401` |
| Missing/invalid audio (no source row; source row with zero chunks) | PASS — both fail with a clear, structured error, no crash |
| OpenAI/transcription-webhook failure does not fail Intake Finish | PASS — tested 3 real scenarios by calling the actual `intake-finish.js` handler: (1) webhook rejects with 401, (2) webhook target unreachable (network error), (3) webhook succeeds but PHI gate blocks server-side — **Finish returned `200 success` in all three** |
| Duplicate/retry webhook invocation does not create corrupt duplicate state | PASS — calling the pipeline twice on the same session: second call returns `alreadyProcessed:true`; segment count and draft-fact count both unchanged after the retry |
| Partial chunk failure represented honestly | PASS — one chunk deliberately corrupted (garbage bytes): pipeline still completed for the other 2, returned `chunksFailed:1, partial:true`, and durably persisted `transcription_status:'partial'` plus the failed chunk's path in `intake_sources.source_payload` — not just an ephemeral return value |

### 8.5 Cleanup — PASS

Every synthetic resident/session/source/segment/draft-fact/approved-fact/decision/storage-object
created during this validation (7 throwaway sessions across 3 scripts) was deleted immediately
after use; residual counts re-queried and confirmed `0` in every case, including storage.

### 8.6 Credential handling during this pass

The real `OPENAI_API_KEY` was retrieved via `netlify env:get` into a local file and read directly
into a child process's environment by a script — never printed, logged, or displayed at any
point; the scratch file was deleted immediately after use. `netlify dev:exec`'s own env
injection was tried first but produced a request-header conflict specific to binary/audio
endpoints (`Invalid Accept header value` from OpenAI's speech API) — unrelated to credential
handling, worked around by running a plain, unwrapped Node process instead.

## 9. Netlify GitHub integration — still not solved, one-time manual action required

Not fixed by this validation pass, and not fixable via CLI/API from here — this is a genuine
gap, not something being glossed over. The `serve-intake` Netlify site's GitHub App connection
was never completed (`installation_id: null`, confirmed again during §7's reconciliation, and
confirmed with a real failed build: `Host key verification failed... Could not read from remote
repository`). Every deploy to this site, including the reconciliation deploy in §7, has been a
direct CLI upload (`netlify deploy`), not a git-triggered build.

**Exact action needed** (a human, in the Netlify dashboard, one time):
1. Go to `https://app.netlify.com/projects/serve-intake/configuration/deploys` (Site settings →
   Build & deploy → Continuous deployment).
2. Find the GitHub connection section and complete/re-authorize the GitHub App installation for
   the `hudsonkeel/serve-intake-mvp` repository (this is the interactive OAuth step that can't be
   scripted).
3. Confirm the production branch is still set to `main`.

After that one-time step, pushes to `main` will trigger real git-backed builds automatically,
the same way `os-servecaregiving` already works. Until then, any future change to this repository
requires a manual `netlify deploy` (or a manually-triggered build hook, as used for verification
in §7) to actually reach production — a real operational gap for whoever maintains this site, not
just a one-off inconvenience.

No further direct production deployment was made to this site during this validation pass — all
testing in §8 ran locally (`intake-finish.js`'s handler invoked directly in a Node script) or
against a local `next dev` server, specifically to avoid deploying the transcription branches to
production before they're reviewed and merged.
