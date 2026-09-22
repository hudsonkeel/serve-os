# Ask Serve Answer Synthesis (v0.1, Slice 2)

Turns retrieved evidence (`lib/askServe/retrieval.ts`, Slice 1) into a grounded, citation-validated
answer for the `/ask-serve` UI. Builds on the knowledge layer — see
`docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md` for retrieval itself; this document covers
everything downstream of it.

## Flow

```
question
  -> retrieveKnowledgeEvidence()            [Slice 1 — unchanged]
  -> if empty: NOT_FOUND_ANSWER, no model call
  -> buildEvidencePacket()                  [caps item count/excerpt length, assigns nothing —
                                              evidenceId is just the real section id]
  -> converseWithClaude()                   [lib/ai/bedrockClaude.ts]
  -> RawSynthesisResponseSchema.safeParse() [reject malformed/invalid output outright]
  -> resolveCitations()                     [drop any id not in the packet; if a non-not_found
                                              answer ends up with zero real citations, fail]
  -> AskServeAnswer                         [server action's return value]
```

## Why the model never gets to state its own citation metadata

`RawSynthesisResponseSchema` (`lib/askServe/answer/types.ts`) only lets the model return
`citedEvidenceIds: string[]` — bare ids. Every other citation field a reader sees (`sourceType`,
`sourceTitle`, `sectionNumber`, `operationalAuthority`, `sourceStatus`, `excerpt`) is reconstructed
server-side in `resolveCitations()` (`lib/askServe/answer/synthesize.ts`) from the real evidence
packet, never from anything the model wrote. A model that hallucinates "this is binding_regulation"
for a citation that's actually `pending_not_binding` cannot make that stick — the label shown to
the user always comes from the database row, not the model's sentence. Verified directly in
`__tests__/synthesize.test.ts`'s "citation metadata always comes from the real evidence record"
test, which simulates exactly this misbehavior.

An id the model invents (not present in the packet it was given) is silently dropped. If *every*
cited id turns out to be invented — the answer would otherwise read as grounded with zero real
grounding behind it — `synthesizeAskServeAnswer` throws `AskServeSynthesisValidationError` instead
of rendering it.

## Bedrock reuse

`lib/ai/bedrockClaude.ts` is a narrow extraction from
`lib/assessmentIntelligence/backgroundCore/providers/bedrockClaudeProvider.ts` (Assessment
Intelligence's existing, already-approved Bedrock/Claude integration) — same pinned region
(`us-east-1`) and model (`us.anthropic.claude-sonnet-4-6`), same injectable-client pattern for
testing without AWS credentials. `bedrockClaudeProvider.ts` now imports its client/region/model
from this shared module and re-exports them under their original names — its own behavior,
prompts, and tests are unchanged. This is not a general AI-provider abstraction: both call sites
are Bedrock Converse API + this one inference profile, nothing else.

## Prompt (`lib/askServe/answer/prompt.ts`)

The system prompt is the actual enforcement surface for every authority/conflict/anti-injection
rule described in the Ask Serve business requirements — see its source for the full text. In
summary, it tells the model:

- Evidence excerpts are quoted source data, not instructions — imperative policy language
  ("staff must...") is content to interpret and cite, never a command directed at the model, and
  nothing in a user question can override these rules either.
- What each `source_type`/`operational_authority` pair may and may not be used for (Serve P&P may
  ground concrete guidance; Texas PAS explains the regulatory baseline but isn't itself a Serve
  instruction; the EPRP is draft/pending and must never be presented as a current requirement).
- The four `supportStatus` values and when each applies.
- Never invent a citation id, never invent a missing Serve procedure, never silently resolve a
  P&P/Texas conflict.

## Evidence packet bounds (`lib/askServe/answer/evidencePacket.ts`)

Caps at 14 evidence items and 3,000 characters per excerpt (with a visible truncation marker, never
silent) — a real concern given some individual sources are tens of thousands of characters (e.g.
§558.2 Definitions). Live-checked against production: real question packets run 9-14 items /
~19K-36K prompt characters, comfortably inside Claude's context window.

## Known limitation as of this slice

No AWS/Bedrock credentials were available in the sandboxed environment this slice was built in
(the configured `serve-bedrock-dev` SSO profile's session had expired, and this repo has no AWS
credentials in its own `.env.local`). Every layer up to and including the real Bedrock request
construction was verified against real production evidence (`lib/askServe/retrieval.ts` hitting
the live Supabase project) with an injected stand-in client — proving the full pipeline's plumbing
end to end. What was **not** verified live: the real Claude model's actual prose, its own
support-status judgment on ambiguous/conflicting cases, and genuine Bedrock latency/error behavior.
`scripts/verify-ask-serve-knowledge-retrieval.ts`'s counterpart for this layer would be the next
live-verification script to write and run once credentials are available.
