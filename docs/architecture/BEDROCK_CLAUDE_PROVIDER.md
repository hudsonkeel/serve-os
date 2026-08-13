# Amazon Bedrock / Claude Provider Integration — Architecture, Security, and PHI Readiness

Branch: `feature/bedrock-claude-provider-abstraction` (serve-os). This is a **code-only,
pre-production** deliverable — no AWS credentials exist in this development environment, so the
Bedrock adapter has never been exercised against real Bedrock. Everything here is either (a)
implemented and tested against a mocked client, or (b) documented design/checklist work pending
a live AWS-credentialed environment.

## 0. Scope correction from the request (read this first)

The originating request named `serve-intake-mvp` as the target repository. Discovery found that
repository actually contains **three separate systems**, and none of them was the safe or
correct place to build this:

1. **A legacy Vercel app** (`server.js`, `api/generate.js`, `api/save-assessment.js`, `schema.js`,
   `prompts.js`) — the original OpenAI extraction pipeline. Its schema has no epistemic
   vocabulary at all (`{value, evidence, confidence, needs_follow_up}`, booleans **default to
   `false`**), and its save path inserts directly into a *separate* Supabase project's own
   `projects`/`residents` tables with no search, no dedup, and no Serve OS person handoff —
   exactly the behavior `serve-intake-mvp`'s own `DECISION_LOG.md` cites as the reason the
   governed redesign happened at all.
2. **The new capture PWA** (`netlify/functions/intake-*.js`) — audio capture only, does no
   extraction.
3. **`serve-os`'s assessment intelligence layer** — already implements every principle Phase 1
   of the request describes: draft facts → human review → approved canonical facts →
   deterministic pricing → the real Serve OS person, never a duplicate.

Per your explicit direction (confirmed before writing any code), this work targets **(3)**. The
legacy app in (1) was not modified and is not part of this branch — its schema/logging/identity
issues are noted here for the record but out of scope.

**Vocabulary correction**: the request's Phase 3 vocabulary (`not_discussed`, `deferred`,
`observed`/`reported` as top-level statuses) is the vocabulary `serve-intake-mvp`'s own
`DECISION_LOG.md` **retired** ("Pre-migration hardening amendments" entries, 2026-08-10),
specifically to fix the same "silently becomes false" risk this request warns against. Per your
confirmation, this work keeps the already-refined, already-shipped model instead: 5
`assertion_state` values (`confirmed_yes`, `confirmed_no`, `uncertain`, `conflicting`,
`not_applicable`) + a separate `collection_method` axis (`observed`/`reported`) + `reporter`;
`not_discussed` is represented by the *absence* of a fact row, never a status value; `deferred`
doesn't exist at the fact level. No schema change was made or needed.

## 1. Provider-neutral extraction design

```
lib/assessmentIntelligence/
  extractionProvider.ts       — AssessmentExtractionProvider interface + ExtractionResult (canonical)
  extraction.ts                — OpenAI implementation (openAiExtractionProvider)
  providers/
    bedrockClaudeProvider.ts   — Bedrock/Claude implementation (bedrockClaudeExtractionProvider)
  providerSelection.ts         — reads ASSESSMENT_EXTRACTION_PROVIDER, fails closed on unknown value
  pipeline.ts                  — calls getConfiguredExtractionProvider(), never a provider module directly
```

`ExtractionResult` (in `extractionProvider.ts`) is the single canonical shape both providers
return — `{accepted, rejected, provider, modelId, rawResponseParseError}`. Neither provider's
raw API response shape (OpenAI's chat-completion envelope, Bedrock's Converse envelope) is ever
visible outside its own module. Both providers call the exact same provider-agnostic prompt
builder (`extractionPrompt.ts`, unchanged) and the exact same `normalizeExtractedFacts()`
validation (`factTypes.ts`, unchanged) — the "unknown ≠ false" guard, evidence requirements, and
field-registry validation apply identically regardless of which provider produced the raw
output. No separate Claude schema exists anywhere.

Persistence: `assessment_draft_facts.model_version` now stores `"{provider}:{modelId}"` (e.g.
`"openai:gpt-5-mini"` or `"bedrock-claude:us.anthropic.claude-sonnet-4-6"`) instead of a bare
model string — this satisfies "preserve provider + model per draft fact" (Phase 3) without a
database migration, by folding both into the column that already existed for this purpose.

## 2. OpenAI adapter (unchanged behavior)

`extraction.ts` is the same code that has been live since the earlier assessment-intelligence
work, now additionally exported as `openAiExtractionProvider` satisfying the interface. Model:
`gpt-5-mini`. No behavior change — same prompt, same parsing, same normalization.

## 3. Bedrock Claude adapter

| | |
|---|---|
| Region | `us-east-1` — pinned as a constant, not env-configurable |
| Inference profile | `us.anthropic.claude-sonnet-4-6` — pinned as a constant, not env-configurable |
| API | Bedrock **Converse API** (`ConverseCommand`), per instruction |
| Credential path | AWS SDK default credential provider chain — no credentials constructed in code. Resolves from environment variables, a shared config/SSO profile, or a workload identity, whichever is present. No static keys are read, parsed, or handled by this module at all |
| Prompt | Identical to OpenAI's — `buildExtractionSystemPrompt()`/`buildExtractionUserPrompt()`, unmodified |
| Response parsing | Reads `response.output.message.content[]`, finds the text block, `JSON.parse()`s it — same shape OpenAI's raw JSON response takes |
| Malformed response | Returns `rawResponseParseError` set, `accepted: []` — never crashes, never guesses |
| Invocation failure (auth, network, throttling) | **Throws** a clear, prefixed error (`"Bedrock Claude invocation failed (model=..., region=...): ..."`) — never returns a fake "no facts" result, never silently retried against OpenAI |
| Testability | `extractFactsViaBedrockClaude(text, client)` accepts an injectable `BedrockConverseClient` (`{send(command): Promise<ConverseCommandOutput>}`) — every test in `bedrockClaudeProvider.test.ts` uses a mock, zero AWS calls |

**Not yet verified**: whether Claude reliably returns valid, parseable JSON for this prompt
without a JSON-mode/tool-use constraint (OpenAI's API was used without `response_format` too,
and that has worked in production) — Bedrock's Converse API does support tool-use for stronger
structured-output guarantees, deliberately not added in this pass to keep scope to what was
asked (prefer Converse "unless repository evidence strongly supports another interface" — there
wasn't yet evidence either way, since Claude has never actually been called). If live testing
later shows unreliable JSON compliance, adding a `toolConfig` with a JSON schema is the
documented next step, not a redesign.

## 4. Application authentication to AWS

No credentials exist in this environment, so no IAM identity was created. Recommended
least-privilege policy, to be created and attached by whoever has AWS console/IAM access
(**verify current Bedrock cross-region inference-profile ARN requirements against AWS's own IAM
documentation before applying — profile permission models have changed across Bedrock API
versions and this was not tested against a real account**):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeApprovedClaudeInferenceProfileOnly",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:ConverseStream"],
      "Resource": [
        "arn:aws:bedrock:us-east-1:<ACCOUNT_ID>:inference-profile/us.anthropic.claude-sonnet-4-6",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6*"
      ]
    }
  ]
}
```

Explicitly **not** granted: account-retention modification, model-permission administration,
AWS Artifact access, budget administration, any IAM action, any service outside Bedrock.

Preferred credential mechanism, in order (per instruction): a workload identity/IAM role for the
deployed environment (Netlify does not natively support AWS IAM roles the way an EC2/Lambda
workload would — this needs the AWS access-key path below **or** an OIDC federation setup, which
is a real design question for whoever configures the deployed environment, not resolved here) >
short-lived SSO credentials for local development > a dedicated non-root IAM user's static access
key only if the above aren't practical, scoped to exactly the policy above, stored as a
platform secret (matching how `OPENAI_API_KEY` is already handled on this project — never
committed, never in a `NEXT_PUBLIC_` var, rotated on a defined schedule, documented removal
procedure when rotated/revoked).

## 5. PHI logging review (Phase 6)

Grepped every `console.*` call across `lib/assessmentIntelligence/`, `lib/data/
assessmentIntelligence.ts`, and `app/api/intake/transcribe/` (the code actually in scope for
this work): **every logged value is an ID or `error.message` (Supabase's own error text) — never
raw transcript content, never a prompt, never a model response, never an extracted fact.** No
PHI-logging fix was needed in the in-scope code.

**Separately flagged, not fixed (out of scope per §0)**: the legacy Vercel app's `server.js` and
`api/generate.js` both do `console.error(rawOutput)` on a JSON-parse failure — this would log
the full raw LLM response (which can contain transcript-derived evidence quotes) to server logs.
`server.js` additionally writes the full extraction output to a local file
(`outputs/latest-output.json`) on every request. These are real findings, left untouched because
the legacy app was explicitly out of scope for this work — flagged here for whoever eventually
retires or hardens that system.

**Open question, not resolved here**: the existing OpenAI extraction path (via `extraction.ts`,
used today for pasted-transcript admin/test extraction and eventually the automatic
audio-derived pipeline once its own PHI gate opens) has **no equivalent BAA/zero-retention gate**
the way `phiGovernance.ts` gates the audio-transcription step. Whether that's intentional
(Serve already has a separate OpenAI enterprise/BAA arrangement covering text extraction) or a
gap is not something this investigation can determine — flagged for an explicit decision, not
assumed either way.

Bedrock model invocation logging: confirmed by you as **OFF**. This code never enables it, never
references CloudWatch/S3 logging configuration, and nothing here would persist a prompt/response
to any AWS logging destination.

## 6. Encryption / secrets

- **In transit**: the AWS SDK's `BedrockRuntimeClient` uses HTTPS/TLS by default; nothing in
  this adapter overrides that.
- **At rest**: this integration introduces **no new AWS persistence** — no S3, no CloudWatch
  logging, no DynamoDB. The only persistence is Serve's existing Supabase tables, unchanged.
- **Secrets**: no AWS credential is read, constructed, or handled anywhere in application code
  beyond letting the AWS SDK's own credential chain resolve them from the environment. Nothing
  is passed through a URL, embedded in HTML, or reachable from client-side JavaScript — this
  entire module has `import "server-only"` and is only ever invoked server-side.

## 7. Cost model — real measured OpenAI usage, published-rate Bedrock estimate

A 3-case synthetic benchmark (see §9) was run live against the real OpenAI API (real token
usage captured from the API response). Bedrock was **not called** — no AWS credentials exist —
so its figures below are an *estimate*, computed by applying published per-token rates to the
*same measured token counts*, not measured Bedrock usage. Labeled accordingly.

| | OpenAI (`gpt-5-mini`) | Bedrock Claude (`claude-sonnet-4-6`, estimated) |
|---|---|---|
| Rate (published, per 1M tokens) | $0.125 input / $1.00 output | $3.00 input / $15.00 output *(nearest publicly documented Claude Sonnet rate at time of writing — re-verify against the actual AWS Bedrock console/Pricing Calculator before budgeting)* |
| Measured input tokens (3-case benchmark total) | 4,626 | *(same, applied hypothetically)* |
| Measured output tokens (3-case benchmark total) | 8,202 | *(same, applied hypothetically)* |
| Total cost, this benchmark run | **$0.0088 (real)** | **$0.1369 (estimated)** — ~15.5× |

**Scaling caveat**: these benchmark transcripts are short (a few exchanges each, ~1,500 input /
~2,700 output tokens per case) — they simulate brief conversation snippets, not full 30-minute
assessments. A real 30-minute assessment transcript is considerably longer. Rough illustrative
extrapolation only (not measured): a 30-minute conversation is roughly 4,000–6,000 tokens of
transcript text, plus the ~800–1,000 token system prompt; a comprehensive extraction covering
most of the ~50-field registry could plausibly produce output in the 6,000–10,000 token range.
At those assumptions: **OpenAI ≈ $0.006–0.010/assessment; Bedrock (estimated) ≈ $0.09–0.15/
assessment.** At an illustrative 500 assessments/month: OpenAI ≈ $3–5/month; Bedrock (estimated)
≈ $45–75/month. These are rough, clearly-labeled projections, not commitments — re-derive from
real Bedrock usage once it can actually be invoked. On-demand inference only was used throughout;
no provisioned throughput was purchased or recommended.

## 8. Provider selection / rollback

```
ASSESSMENT_EXTRACTION_PROVIDER=openai   # default if unset — the known-working provider
ASSESSMENT_EXTRACTION_PROVIDER=bedrock  # explicit opt-in
```

Set on any *unrecognized* value → `getConfiguredExtractionProvider()` throws immediately, rather
than guessing a default. A provider that fails during a real extraction call throws all the way
up through `pipeline.ts` — nothing catches that error and reroutes to the other provider. **No
silent fallback exists anywhere in this code.** Rollback from Bedrock to OpenAI, if ever needed,
is exactly: unset the env var (or set it to `openai`) and redeploy — no code change, no data
migration, nothing to undo in the schema.

## 9. Benchmark methodology and results (Phase 8/9)

Three synthetic, fabricated benchmark cases (`straightforward`, `sparse`, `contradictory-
uncertain` — covering dressing/medication reminders/mobility/falls/family-contact,
sparse/mostly-not-discussed, and genuinely contradictory two-reporter statements with an
uncertain cognitive signal). Run live against OpenAI; **Bedrock could not be run — no AWS
credentials.**

| Metric | OpenAI result |
|---|---|
| Expected-field accuracy | 7/8 (the one "miss" was the model correctly reading "no falls *that I know of*" as `uncertain` rather than a flat `confirmed_no` — arguably more epistemically correct than the benchmark's own hand-authored expectation, not a real extraction defect) |
| `not_discussed → false` violations | **0 across all 3 cases** |
| Conflicting-statement handling | Correctly captured **both** contradictory claims about `mobility_safety.walker` (`confirmed_yes` from one reporter, `confirmed_no` from another) as separate facts, each attributed to its own evidence |
| Schema compliance | 3/3 cases returned valid, parseable JSON matching the expected shape |
| Hallucinations | None observed |
| Average latency | ~17.8s/case |

Claude/Bedrock: **not run this pass.** The harness (`_tmp_run_benchmark.ts`/
`_tmp_benchmark_cases.ts` in this session, not committed — see §11) is structured to run either
provider through the same interface; re-running it against `bedrockClaudeExtractionProvider`
once credentials exist requires no code change beyond pointing it at that provider.

## 10. PHI production readiness checklist

**PHI READY: NO**

### Already verified externally (per your report, not independently re-verified by this session)
- [x] Serve-owned AWS account exists
- [x] Root MFA enabled
- [x] AWS BAA is Active
- [x] Bedrock account retention explicitly set to `none`, re-read and confirmed
- [x] Bedrock model invocation logging is OFF
- [x] Monthly AWS development budget is configured
- [x] `us.anthropic.claude-sonnet-4-6` inference profile is ACTIVE
- [x] A synthetic test invocation succeeded through Bedrock while retention remained `none`
- [x] No production PHI has been sent to Bedrock

### Externally documented, not independently verified by this session (public AWS documentation, cited)
- Amazon Bedrock is HIPAA-eligible (confirmed via AWS's own published HIPAA-eligible-services
  guidance)
- Bedrock's `data_retention_mode: none` **fails closed**: per AWS's own published documentation,
  "if your account or project is configured for zero data retention... and you invoke a model
  that requires retention, Amazon Bedrock will block the request and return an error" — this is
  enforced by the platform, not merely application-level discipline. Your synthetic test
  succeeding under `none` is consistent with this model+account combination genuinely being
  ZDR-eligible (an incompatible combination would have errored, not succeeded).

### Must be verified in application/deployment — NOT YET DONE
- [ ] Least-privilege AWS identity actually created and attached (policy drafted in §4, not
      created — no AWS access in this environment)
- [ ] Credentials actually secured in the real deployment target (design only — nothing
      deployed)
- [ ] No PHI in logs — **verified for the code this branch touches** (§5); legacy app not fixed,
      flagged as out of scope
- [ ] No client-side secrets — verified by code inspection (`server-only` throughout), never
      exercised in a real deployed environment yet
- [ ] No raw PHI in URLs — not applicable, no new URL-carrying code path introduced
- [ ] All AWS services in the PHI path are HIPAA-eligible — only Bedrock itself is in the path
      in this design (no S3/CloudWatch/other AWS persistence introduced); Bedrock's own
      eligibility is externally documented above, not independently re-verified against your
      specific account's service list
- [ ] Encryption in transit — TLS via AWS SDK default, not independently packet-verified
- [ ] Encryption at rest — not applicable, no new AWS persistence introduced
- [ ] No unintended prompt/response persistence — confirmed by code inspection (no logging
      calls carry payload content), not verified against a live account's CloudTrail/billing
      records
- [ ] Production environment variables correctly scoped — not deployed anywhere yet
- [ ] Provider fail-closed behavior — **verified** via unit tests (throws, never falls back)
- [ ] Live Bedrock invocation actually succeeds from this codebase specifically — **never
      tested**, no AWS credentials
- [ ] Approval recorded before production PHI enablement — pending; this document is not that
      approval

Given the number of unchecked items — most fundamentally, **this code has never made a real
Bedrock API call** — `PHI READY: NO` is not a close call.

## 11. Serve OS / AxisCare downstream contract (Phase 13 — documentation only, no new APIs)

Unchanged from the existing, already-implemented flow — this work adds a second *upstream*
provider option, nothing downstream:

```
AI provider (OpenAI or Bedrock Claude, selected via ASSESSMENT_EXTRACTION_PROVIDER)
  → assessment_draft_facts (evidence, epistemic status, provider+model, never trusted)
  → human review (AssessmentReviewPanel — unchanged)
  → assessment_approved_facts (human-approved, canonical)
  → deterministic pricing engine (unchanged, provider-blind — recommendPricing() has no
    parameter for which AI provider produced the input facts, structurally impossible to be
    swayed by provider choice)
  → AxisCare readiness/payload preview (computeAxisCareReadiness/buildAxisCarePayloadPreview,
    unchanged — still preview-only, no write path exists)
  → Cinch projection (buildCinchProjection, unchanged — still draft-only)
```

No new AxisCare write behavior, no new API contracts invented. A future AxisCare write path (if
ever built) would consume `assessment_approved_facts` exactly the same way regardless of which
provider originally produced the corresponding draft — this is precisely why the provider
abstraction lives upstream of approval, not downstream of it.

## 12. Tests and build results

- `npm run test:assessmentIntelligence`: **39/39 passing** (28 pre-existing unchanged + 9 new
  Bedrock-provider tests + 5 new provider-selection tests, both fully mocked, zero AWS calls)
- `npx tsc --noEmit`: 0 errors
- `npm run lint`: 2 pre-existing, unrelated issues only (unchanged from before this branch)
- `npm run build`: clean
- Regression suites (`test:residents`, `test:auth`, `test:relationships`, `test:axiscare`): all
  passing, unaffected

## 13. Rollback behavior

Nothing in this branch changes default behavior — `ASSESSMENT_EXTRACTION_PROVIDER` unset means
every existing code path runs exactly as it did before this branch, through OpenAI, unchanged.
Merging this branch changes nothing about production behavior by itself; Bedrock only activates
if the env var is explicitly set to `bedrock` in a given environment, and even then, real
extraction would immediately throw (never silently succeed with fabricated data) since no AWS
credentials exist anywhere this code runs today.
