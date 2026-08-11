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

| Variable | Site | Purpose | Set by |
|---|---|---|---|
| `INTAKE_TRANSCRIBE_WEBHOOK_SECRET` | serve-os (`os-servecaregiving`) **and** serve-intake-mvp (`serve-intake`) — same value on both | Shared secret authenticating the cross-repo webhook call, matching the existing pattern at `app/api/intake/process/route.ts` | Safe for me to generate and configure directly (a fresh internal secret with no pre-existing external account tied to it — not a credential I'd be reading from anywhere) — **not yet done, see §7** |
| `PHI_OPENAI_PROCESSING_CONFIRMED` | serve-os | The governance gate (§2) | **Only the user** — never set by me, and not set as of this branch |
| `SERVE_OS_TRANSCRIBE_WEBHOOK_URL` | serve-intake-mvp | Target URL for the webhook call (`https://os-servecaregiving.netlify.app/api/intake/transcribe`) | Not a secret — safe for me to set once the intake-finish.js change ships |

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

## 6. What is proven vs. not yet proven

**Proven** (automated tests, `npm run test:assessmentIntelligence`, all passing; `tsc --noEmit`
0 errors; full production build succeeds; `/api/intake/transcribe` registers as a route):
- The PHI gate fails closed by default and for any near-miss value, at every entry point that
  could reach OpenAI with real audio — including the webhook path, before it ever touches the
  database.
- Chunk-path parsing/ordering logic is correct.
- The refactored pasted-transcript path still typechecks and builds cleanly (no behavior change
  intended or introduced).

**Not yet proven — no live run was possible in this environment:**
- An actual transcription call against real OpenAI audio API (no synthetic audio artifact was
  available to construct one safely, unlike the text-extraction slice where a fabricated
  transcript was trivial to write by hand).
- The full webhook round trip from a real `intake-finish.js` invocation.
- Storage download/list against a session with real uploaded chunks.

None of this can be tested against real captured audio until the PHI gate is explicitly opened
by the user — and even then, testing should use a synthetic/test recording, not a real
resident's session, consistent with the same governance already applied to the text pipeline.

## 7. Open finding this depends on — not yet resolved

While preparing to wire `intake-finish.js`, discovery found that **the entire capture pipeline
in `serve-intake-mvp`** (`netlify/functions/*.js`, `public/capture/*`, and the architecture docs
describing it) **has never been committed to that repository** — confirmed via
`git log --all -- netlify/ public/capture/`, zero results on every branch. The last real commit
on `main` is from 2026-06-11; the capture pipeline files on disk are dated 2026-08-10 and exist
only in the local working tree. It is live in production only because every deploy so far used
direct CLI upload (`netlify deploy`), which bypasses git entirely.

This is the same class of gap previously found and fixed in serve-os ("Production UI
Reconciliation") — except here the code was never committed at all, not merely unpushed. I have
not modified `intake-finish.js` or committed anything in that repository yet, and am not doing
so without surfacing this first: layering a new, reviewable "add the transcription trigger" diff
on top of an uncommitted, unversioned pile of unrelated pre-existing work would make neither
change reviewable on its own, and leaves the live site's actual source recoverable only from one
machine's disk. See the accompanying chat message for the reconciliation options.
