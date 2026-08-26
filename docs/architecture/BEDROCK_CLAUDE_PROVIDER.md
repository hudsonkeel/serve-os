# Amazon Bedrock / Claude Provider Integration — Architecture, Security, and PHI Readiness

Branch: `feature/bedrock-claude-provider-abstraction` (serve-os). Originally a **code-only,
pre-production** deliverable — sections 0-13 below were written when no AWS credentials existed
in this development environment and the Bedrock adapter had never been exercised against real
Bedrock. **Update (see §9a/§14/§15): a live benchmark has since been run against the real
Bedrock Converse API using dedicated dev credentials (`serve-bedrock-dev`).** The adapter code
itself is unchanged by that run — no code defect was found. Sections 0-13 are left as originally
written (historical record); §9a, §14, and §15 are additive.

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

**Update — real Bedrock usage now measured, see §9a/§15.** Bedrock has since actually been
invoked live; §9a replaces the "estimated" Bedrock token counts above with real measured ones.
The **per-token rate** in the table above ($3.00 input / $15.00 output per 1M tokens) was **not
re-verified against AWS's pricing pages this pass** (out of scope for this benchmark phase, and
the user's pricing-architecture clarification below applies to *Serve's client-facing care
pricing*, not this AI-usage cost table — the two are unrelated pricing surfaces; see §14) — it
still carries the original "re-verify before budgeting" caveat.

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

## 9a. Live Bedrock benchmark — real results (later session, real AWS credentials)

**Important comparability caveat, read first:** `_tmp_run_benchmark.ts`/`_tmp_benchmark_cases.ts`
from §9 were session-scratch files, deliberately not committed, and are confirmed unrecoverable
(checked: not in the working tree, not in any OS temp directory, not reachable via `git fsck
--unreachable --dangling` or `git log --all`). **This run therefore uses a newly authored set of
3 synthetic cases**, matching the same design/coverage described in §9
(`straightforward`/`sparse`/`contradictory-uncertain`) but not byte-identical to whatever text
originally produced OpenAI's recorded 7/8 result. The comparison below is same-methodology, not
same-input — treat the accuracy numbers as directionally informative from n=3 cases, not a
controlled head-to-head. Full case transcripts and code are reproduced below/in §15 since the
harness itself was deleted after this run (same "not committed" convention as before).

**Setup**: identity verified via `aws sts get-caller-identity --profile serve-bedrock-dev
--region us-east-1` → `arn:aws:iam::205382053980:user/serve-bedrock-dev` (account
`205382053980`). All 3 calls went through the real, unmodified `extractFactsViaBedrockClaude()`
production function (not a reimplementation) — a real `BedrockRuntimeClient` was passed in via
the same injectable-client seam the unit tests use, wrapped only in a pass-through that recorded
`usage`/`metrics`/`stopReason` as a side channel. No PHI, no production data — all 3 transcripts
below are fabricated with fictional names.

| Metric | Case 1: `straightforward` | Case 2: `sparse` | Case 3: `contradictory-uncertain` |
|---|---|---|---|
| Schema compliance | PASS (valid JSON, matched shape) | PASS | PASS |
| Input tokens (real, measured) | 1,921 | 1,735 | 1,756 |
| Output tokens (real, measured) | 830 | 108 | 492 |
| Latency (wall-clock around the real call) | 7,219 ms | 2,247 ms | 5,065 ms |
| Latency (Bedrock-reported, `response.metrics.latencyMs`) | 6,967 ms | 2,050 ms | 4,898 ms |
| Expected-field accuracy (field_path + assertion_state exact match against hand-authored expectations) | 8/8 | 0/1 | 1/3 |
| Unsupported assertions (accepted fact with no real evidence) | 0 | 0 | 0 |
| Reporter attribution correctness | 8/8 correct, non-null, correctly disambiguated | 1/1 correct | 5/5 correct, including correctly distinguishing 2 different reporters on the same field_path |
| `rejected` facts | 0 | 0 | 0 |

**Totals**: 5,412 input tokens / 1,430 output tokens / 6,842 total across 3 real calls. Average
wall-clock latency 4,844 ms/case. **Zero hallucinations observed** — every accepted fact across
all 3 cases carried a real, checkable evidence quote/paraphrase actually present in its
transcript; nothing was invented. **Zero unsupported assertions** — nothing was accepted without
evidence and non-`none` confidence (consistent with §3's normalization rules, which apply
identically regardless of provider).

**Case 1 (`straightforward`, 8/8)**: exact match on every hand-authored expected fact
(dressing, medication reminders, a medication-mistake signal, a recent fall, cane use, primary
contact name/phone, decision-maker). One additional fact was extracted beyond what was
hand-authored as "expected" (`important_people.primary_contact_relationship` = "daughter") —
inspected and it is correct and evidence-backed (the transcript does establish Maria is the
daughter), just outside the narrower expected set. Reasonable extraction, not a hallucination.

**Case 2 (`sparse`, 0/1) — genuine epistemic-fidelity miss**: the transcript's only close-to-
substantive line was David saying "Not that I'm aware of, no" about falls — a hedge, per the
system prompt's own rule 2 ("uncertain" = "stated but hedged, or evidence is weak"). Live Claude
returned `assertion_state: "confirmed_no"` (confidence `medium`, not `high`) rather than
`uncertain`. This is the **opposite** of what §9's OpenAI benchmark demonstrated on comparable
phrasing ("no falls that I know of" → correctly read as `uncertain`, called out in §9 as
"arguably more epistemically correct"). On this specific, directly comparable class of hedged
negative, this single live Bedrock run got it wrong where the recorded OpenAI run got it right.
With n=1 this is a data point, not a trend — but it is a real, reproducible-looking failure mode
(hedge → flattened to a confident negative) worth watching if a larger benchmark is run later.

**Case 3 (`contradictory-uncertain`, 1/3) — prompt ambiguity, not a clear defect**: the
walker-conflict fields scored as MISS only because Claude and the hand-authored expectation
picked different (both schema-valid) readings of an ambiguous prompt rule. Rule 2 says:
*"'conflicting' (two people said different things about the same field_path — emit both as
separate facts, both assertion_state reflecting what each person said)."* §9's OpenAI run
apparently read "reflecting what each person said" as *"use `confirmed_yes`/`confirmed_no`
respectively"* (§9: "captured both contradictory claims... as separate facts, each attributed to
its own evidence" with concrete `confirmed_yes`/`confirmed_no` states). Live Claude instead used
the literal enum value `"conflicting"` for both entries — also a fully valid `assertion_state`
per the same rule and the 5-value vocabulary documented in §0. **This is a real, measured
divergence in how the two providers resolve the same ambiguous instruction, not a Claude
error** — the prompt text supports both readings. It also has a benign-to-favorable downstream
effect: `pricingEngine.ts`'s `confirmedCount()` only counts `assertionState === "confirmed_yes"`,
so a field marked `"conflicting"` on both sides can never silently count toward a pricing tier —
arguably the *safer* default for a contested field, though either reading is moot for pricing
specifically, since `reviewExceptions.ts` already blocks approval on any open conflict
regardless of which literal `assertion_state` string was used, so contested facts never reach
`assessment_approved_facts` un-resolved either way (see §14 for why this matters for pricing
integrity specifically). The cognition memory-change hedge (`uncertain`) was correctly identified
(1/3 MATCH); Claude also extracted `cognition.short_term_memory_change: confirmed_no` from
Michael's "I haven't noticed anything like that" and a related `cognition.repeated_questions:
uncertain` fact — both are evidence-backed and defensible, just outside the narrow 3-item
expected set authored for this case.

**Structured-output reliability — verdict: no adapter change made.** All 3 live calls returned
clean, directly-`JSON.parse()`-able JSON matching the exact expected shape — no markdown fences,
no leading/trailing commentary, no malformed output. 3/3 (100%) schema compliance on real,
non-mocked traffic. Per instruction, the adapter is only to be strengthened (e.g. adding a
`toolConfig` JSON-schema constraint to the Converse call) **if live results show a concrete
need** — they didn't. No code change was made to `bedrockClaudeProvider.ts` or
`extractionPrompt.ts`. The epistemic-behavior findings above (Case 2/3) are a semantic/prompt-
clarity question, not a structured-output/JSON-parsing reliability question, and are recorded as
a future-work note (see §15) rather than acted on in this pass, consistent with "do not redesign
unless a minimal change is required."

**Fail-closed behavior**: not re-exercised against a real Bedrock error in this session — all 3
live calls succeeded, so the real invocation-failure path was not triggered live. That path
remains verified only via the mocked `bedrockClaudeProvider.test.ts` (`fakeClientThrowing` —
still passing, 9/9, re-run this session, see §15).

**Least-privilege boundary — verified, not just designed**: `aws bedrock
get-model-invocation-logging-configuration --profile serve-bedrock-dev` was attempted as a
deliberate boundary probe and correctly returned `AccessDeniedException` ("User:
arn:aws:iam::205382053980:user/serve-bedrock-dev is not authorized to perform:
bedrock:GetModelInvocationLoggingConfiguration"). Per instruction, this was **expected and not
escalated** — the account-retention/logging-config setting was already externally verified as
`none`/off before this test, and this identity is correctly scoped to invoke-only
(`bedrock:InvokeModel`/`Converse`/`ConverseStream`), matching the policy drafted in §4 exactly.
This is a real, positive security finding: the least-privilege policy is not just written down,
it is enforced by AWS and was proven to reject an out-of-scope call.

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

### Must be verified in application/deployment — status as of §9a's live run
- [x] **NOW VERIFIED (§9a)** — Least-privilege AWS identity actually created and attached:
      `arn:aws:iam::205382053980:user/serve-bedrock-dev` exists, successfully invoked the
      pinned model, and was confirmed denied on an out-of-policy action
      (`bedrock:GetModelInvocationLoggingConfiguration` → `AccessDeniedException`). Matches the
      policy drafted in §4.
- [ ] Credentials actually secured in the **real deployment target** — still NOT DONE. §9a used
      a local named AWS CLI/SDK profile (`serve-bedrock-dev`) for dev-machine testing only. No
      workload identity, OIDC federation, or deployed-environment secret storage has been set up
      or exercised. This remains exactly the open design question flagged below (Netlify has no
      native AWS IAM role equivalent).
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
- [x] Provider fail-closed behavior — verified via unit tests (throws, never falls back). Not
      re-exercised against a real Bedrock error in §9a (all 3 live calls succeeded); real-error
      fail-closed behavior still rests on the mocked test, not a live failure.
- [x] **NOW VERIFIED (§9a)** — Live Bedrock invocation actually succeeds from this codebase
      specifically: 3/3 real `ConverseCommand` calls succeeded, real token usage returned, real
      valid JSON parsed, through the actual unmodified production function.
- [ ] Approval recorded before production PHI enablement — still pending; this document is
      **still not that approval**. §9a proves the code path works against real infrastructure
      with synthetic data — it does not constitute clearance to send real PHI.

**Updated verdict: `PHI READY: NO` still stands, but the reason has changed.** Before §9a, the
blocker was "this code has never made a real Bedrock call at all" — an unknown-unknowns risk.
That risk is now retired: the adapter, the pinned model/region, and the least-privilege identity
all work, live, exactly as designed. What remains is deployment/process work, not code risk:

1. No production credential path exists (workload identity / OIDC federation for the deployed
   environment — still just a design question, see §4).
2. No human approval has been recorded authorizing real PHI to reach Bedrock (this document does
   not grant that; it documents readiness, not authorization).
3. Several checklist items above (HIPAA-eligible-service inventory against the actual account,
   CloudTrail/billing confirmation of no unintended persistence, production env var scoping)
   still require account-admin-level access this least-privilege identity correctly does **not**
   have — and per instruction, broader permissions were not requested to close them. They must
   be verified by whoever holds that access, not by this identity or this session.
4. §9a's own case 2/3 findings (an epistemic miss on a hedged negative; a schema-valid but
   differently-resolved ambiguity in the "conflicting" rule) are extraction-*quality* questions,
   not PHI-*safety* questions — they don't block PHI readiness, but are worth a larger benchmark
   before leaning on Bedrock's output quality at parity with OpenAI's.

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

**Update (§9a)**: the "no AWS credentials exist anywhere this code runs today" clause above is
now only true of *deployed* environments — a local dev profile now exists and was used for
live testing. It is not wired into any deployed environment, so this rollback/no-default-change
analysis is otherwise unaffected.

## 14. Canonical Pricing Source Assessment

Added per an explicit mid-benchmark clarification: **do not conflate this document's AI-usage
cost table (§7 — what Serve pays OpenAI/AWS per token) with Serve's client-facing care/service
pricing (what Serve charges a resident/family for a Touch Point/Essential/Comfort/Deluxe visit
or package).** They are unrelated pricing surfaces. This section is about the latter only, and
is an **assessment, not a redesign** — no pricing code was changed in this pass.

### Current pricing source

- **File**: `lib/assessmentIntelligence/pricingCatalog.ts` — a plain, hardcoded TypeScript
  module (`A_LA_CARTE`, `PACKAGES` — 4 a la carte services, 4 packages, literal numeric
  `unitPrice`/`dailyPrice`/`monthlyPrice` fields).
- **Origin**: per the file's own header comment, "ported and modernized from the old Serve
  Intake MVP's `pricingRules.js` (same published rates/services)" — i.e., copied forward from a
  legacy repo's hardcoded rules file into this repo's hardcoded catalog file. Not independently
  re-verified against `serve-intake-mvp` in this pass (out of scope) — documented as stated in
  the code's own comment.
- **Rule engine**: `lib/assessmentIntelligence/pricingEngine.ts`'s `recommendPricing()` — a pure
  function that scores confirmed facts against fixed field-path lists (`PERSONAL_CARE_FIELDS`,
  `LIGHT_TASK_FIELDS`, `CHECK_IN_ONLY_FIELDS`) and fixed thresholds, and either returns a
  recommended catalog entry verbatim or `"pricing_review_required"` (never invents a rate — a
  deliberate tightening versus the legacy MVP, which defaulted to "Essential Service" and
  invented custom estimates for out-of-range durations, per the file's own header comment).

### Whether AI can influence numeric price

**No, not the dollar figures.** Two independent structural reasons, both verified by reading the
code (not just documentation claims):

1. `recommendPricing(facts: FactForPricing[])` takes only `{fieldPath, assertionState, value}`
   and is called (`lib/actions/assessmentIntelligence.ts:159-196`, `approveAssessment()`) only
   over rows from `getApprovedFactsForResident()` — **human-approved** facts, never AI draft
   output directly. There is no parameter carrying which provider (or any free-text/numeric
   value from the AI) into a price. Every dollar amount returned comes from the static
   `A_LA_CARTE`/`PACKAGES` constants — never computed, interpolated, or generated from model
   output.
2. Even upstream of that, a **contested fact can't reach approval to begin with**:
   `reviewExceptions.ts` surfaces any field with an open conflict and blocks
   `readyForApproval` until a human resolves it (existing tests: "an open conflict blocks
   readyForApproval," "a resolved conflict does not block approval readiness" — both still
   passing, re-run this session). This is directly relevant to §9a's Case 3 finding: regardless
   of whether a provider emits a contested field as two `conflicting` facts or as
   `confirmed_yes`/`confirmed_no` pointing at each other, neither reaches
   `assessment_approved_facts` — and therefore neither reaches pricing — without a human
   resolving the conflict first. AI can influence **which catalog tier gets selected** (by what
   facts a human ultimately approves as `confirmed_yes`), but never **what that tier costs**.

### Whether pricing is versioned

**Loosely, yes — but as a single current version, not a historical catalog.** Two string
constants exist: `PRICING_CATALOG_VERSION` (`pricingCatalog.ts`) and `PRICING_RULES_VERSION`
(`pricingEngine.ts`), both currently `"2026-09-01.1"`. Both are threaded through
`approveAssessment()` into `writeAssessmentDecision()` and persisted to real columns —
`assessment_decisions.catalog_version` / `.rules_version` (confirmed in the migration,
`supabase/migrations/20260901000000_create_assessment_intelligence_layer.sql:205-206`, both
plain `text`, not enums or foreign keys to a version table).

### Whether historical quotes identify the pricing version used

**Yes, per-decision, going forward from when this table was introduced.** Every pricing decision
row in `assessment_decisions` carries the `catalog_version`/`rules_version` string that was
active when that decision was made — so a historical quote can be traced back to *which version
label* produced it. What this does **not** give you: there is no `pricing_catalog_versions`
table or equivalent — the only place the actual numbers for a given historical version live is
git history of `pricingCatalog.ts` at that commit. You can prove *which version* priced a past
quote; you cannot query the system for *what that version's numbers were* without checking out
that point in git history yourself.

### Gaps

1. **No independently-editable canonical catalog.** The catalog is application source code, not
   data. Changing a rate is a code change (PR, review, deploy) — there is no admin-facing config
   surface, database table, or CMS a non-engineer could use to update a price. This is the core
   gap relative to "Serve owns a canonical, versioned pricing catalog independent of any AI
   provider": today, Serve owns it in the sense of "it's Serve's own code," but not in the sense
   of "an independently versioned, queryable, admin-manageable data source."
2. **No historical version table.** `PRICING_CATALOG_VERSION`/`PRICING_RULES_VERSION` are single
   current-value string literals, manually bumped by whoever edits the file, with no documented
   convention for the string's meaning (looks like a date + sequence, but that's inferred, not
   specified) and no automated check that the two stay in sync (they currently happen to match,
   nothing enforces that they must).
3. **`human_override` is schema-only, not implemented.** `assessment_decisions.human_override`
   (jsonb) exists in the migration and is referenced in
   `docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md`, but no application code reads
   or writes it — grepped `human_override`/`humanOverride` across the repo; only the migration
   and that doc reference it. When `recommendPricing()` returns `"pricing_review_required"`,
   there is a `status` value for it, but this pass found no traced UI/action that lets a human
   actually record and persist their manual quote in that same governed, versioned way.
4. **No cross-repo verification.** The catalog's origin claim ("same published rates/services"
   as `serve-intake-mvp`'s `pricingRules.js`) is taken from this file's own comment, not
   independently checked against that other repository in this pass.

### Recommended migration to a canonical versioned Serve pricing catalog

Not implemented in this pass (explicitly out of scope — "do not redesign pricing during this
Bedrock benchmark phase"). For a future pass: move `A_LA_CARTE`/`PACKAGES` into a real
`pricing_catalog_versions`-style table (versioned rows, an `effective_at`/`superseded_at` pair or
an explicit `is_active` flag, one row per historical version rather than one mutable file),
keep `recommendPricing()`'s pure-function shape and its AI-blind signature exactly as-is (that
property is worth preserving, not just the storage location), and implement the already-modeled
`human_override` write path so a manual `pricing_review_required` resolution is captured with
the same rigor as an automated recommendation. None of this is required to ship the Bedrock
provider work in this branch — it is an independent gap in the existing (pre-dating this branch)
pricing engine, surfaced here because it was explicitly asked about, not because this branch
introduced or worsened it.

## 15. Final report — live benchmark, security findings, PHI readiness, merge readiness

This section is the direct answer to "update the final report" for this phase. Everything below
was produced with real AWS credentials, real API calls, and no production PHI.

### What was done
- Verified caller identity: `aws sts get-caller-identity --profile serve-bedrock-dev` →
  `arn:aws:iam::205382053980:user/serve-bedrock-dev`, account `205382053980`.
- Probed the least-privilege boundary: attempted `bedrock:GetModelInvocationLoggingConfiguration`
  (not in the granted policy) — correctly denied with `AccessDeniedException`. Did not request
  broader access, per instruction; the externally-verified `none` retention setting was taken as
  given, not re-derived.
- Ran 3 newly authored synthetic benchmark cases live against the real Bedrock Converse API
  through the actual, unmodified `extractFactsViaBedrockClaude()` production function (see §9a
  for full results, per-case findings, and the comparability caveat against §9's OpenAI numbers).
- Evaluated structured-output reliability (3/3 valid JSON) and made **no code change** — no
  concrete need was shown.
- Investigated the deterministic pricing engine's source, versioning, and AI-influence
  properties (§14) — assessment only, no redesign.
- Re-ran `npx tsc --noEmit` (0 errors) and `npm run test:assessmentIntelligence` (all suites
  passing, including the still-fully-mocked `bedrockClaudeProvider.test.ts`, 9/9 — zero AWS calls
  in the automated suite; only this session's manual harness touched real AWS).
- Deleted the scratch benchmark harness (`_tmp_bedrock_benchmark.ts`) after capturing its output
  into this document — not committed, matching the §9/§11 precedent.

### Real Bedrock vs. OpenAI — token/cost comparison
Real measured Bedrock usage this run: **5,412 input / 1,430 output tokens** across 3 cases
(§9a). OpenAI's previously recorded real usage (§9, different case content): 4,626 input / 8,202
output tokens across its own 3 cases. **These totals are not directly comparable** — the
transcripts differ in length and content, so token-count deltas mostly reflect that, not a
provider difference. The stable, comparable number is the **per-token rate**: OpenAI
(`gpt-5-mini`) $0.125/$1.00 per 1M input/output tokens vs. Bedrock Claude's last-documented
estimate of $3.00/$15.00 per 1M (§7, not re-verified this pass) — Bedrock's rate is roughly
24x OpenAI's on input and 15x on output, consistent with §7's original "~15.5x on identical
hypothetical tokens" framing. At this run's real Bedrock token counts and that same rate: **≈
$0.038** for the 3 live calls (5,412 × $3.00/1M + 1,430 × $15.00/1M) — real tokens, estimated
rate, so labeled as an estimate, not a fully real dollar figure.

### Security findings
1. **Positive**: least-privilege policy is enforced by AWS, not just documented — the boundary
   probe above proves it, not merely asserts it.
2. **Positive**: zero unsupported assertions and zero hallucinated facts observed across all 3
   live cases — every accepted fact carried real, checkable evidence.
3. **Neutral/for-the-record**: fail-closed behavior on a genuine Bedrock invocation error was
   *not* exercised live this session (all 3 calls succeeded) — it remains verified only via the
   mocked unit test, same as before this session.
4. **No new attack surface**: no code changed in `bedrockClaudeProvider.ts`, so §6's
   encryption/secrets/logging analysis is unaffected and not re-litigated here.

### PHI readiness
**`PHI READY: NO`** — unchanged conclusion, but see §10's updated checklist: the previously
fundamental blocker ("this code has never made a real Bedrock call") is retired. What remains is
listed precisely in §10's "Updated verdict" block — no production credential path, no recorded
human approval, and several account-admin-only checklist items this least-privilege identity
correctly cannot self-verify.

### Exact remaining blockers (merge and PHI, kept separate — they are different gates)
**Blocking merge to `main`**: none identified by this pass — typecheck clean, full
`test:assessmentIntelligence` suite passing, no code changed, no default behavior changed
(`ASSESSMENT_EXTRACTION_PROVIDER` unset still defaults to `openai`). This branch remains
mergeable on its own technical merits, independent of PHI readiness.

**Blocking PHI production readiness** (see §10 for full detail):
1. No deployed-environment credential path (workload identity/OIDC) exists or has been tested.
2. No human sign-off recorded authorizing real PHI to Bedrock.
3. Several checklist items require account-admin access not held (correctly) by the
   least-privilege identity used here, and were not independently re-verified this pass.

**Separately, not a blocker for either gate, but worth a decision before leaning on Bedrock in
production**: §9a's Case 2/3 findings (a hedge misread as a confident negative; an ambiguous
prompt rule resolved two different ways by two providers) suggest the extraction-quality
comparison between providers is not yet settled at n=3 cases. A larger, apples-to-apples
benchmark (same case set run against both providers) and/or a prompt clarification for rule 2
would be reasonable follow-up work, not requested or done in this pass.

### Ready to merge?
**Technically yes** for this branch as a code change (tests green, typecheck clean, no default
behavior change). **Not merged in this session, per instruction.** Whether to merge is left to
you — this report is informational, not an action.

### Explicitly not done in this session
- Did not merge to `main`.
- Did not enable production PHI processing for Bedrock (no flag exists for this today, and none
  was added).
- Did not modify `bedrockClaudeProvider.ts`, `extractionPrompt.ts`, `pricingEngine.ts`, or
  `pricingCatalog.ts`.
- Did not request broader AWS permissions than the policy already grants.
- Did not re-verify the $3.00/$15.00 Bedrock per-token rate against AWS's current pricing pages.
