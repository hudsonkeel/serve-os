# Ask Serve Knowledge Layer (v0.1)

The grounded-evidence foundation for Ask Serve's policy/regulatory Q&A
capability. This slice implements retrieval only — it returns evidence,
never a synthesized answer. See `docs/architecture/ask-serve-knowledge-coverage-manifest.json`
for exactly what is (and isn't) currently ingested.

## Source directories

| Directory | Source type | What's there |
|---|---|---|
| `docs/organizational-knowledge/policies/` | `serve_pnp` | One `.docx`: Serve Caregiving Policies and Procedures |
| `docs/organizational-knowledge/regulations/texas-pas/` | `texas_pas`, `texas_statute_cross_reference` | Individual §558 regulation PDFs (one PDF = one section); the combined/omnibus PDF is excluded as redundant |
| `docs/organizational-knowledge/controlled-procedures/` | `serve_controlled_procedure` | One `.docx`: the EPRP (Emergency Preparedness and Response Plan) |

Ingestion (`scripts/ingest-ask-serve-knowledge.ts`) expects exactly one
`.docx` under `policies/` and exactly one under `controlled-procedures/`
(searched recursively) — it refuses to guess if it finds zero or more
than one, rather than silently ingesting the wrong file.

## Source types and status semantics

Two independent axes on every `knowledge_documents` row, per this
feature's governance requirement that a document's revision state must
never be confused with whether Ask Serve may treat it as authoritative:

- **`source_status`** — the document's own lifecycle state: `current`,
  `draft_pending_review`, or `superseded`. A fact about the document.
- **`operational_authority`** — what Ask Serve is allowed to treat the
  document as: `current_operating_policy` (Serve P&P), `binding_regulation`
  (Texas PAS), `supplementary_reference` (a cross-referenced statute, not
  itself a §558 rule), or `pending_not_binding` (explicitly draft/under
  review per the source itself).

These can diverge in either direction. The P&P is `current` *and*
`current_operating_policy` — evidenced by having no draft marker anywhere
in its text, despite one existing (external, historical) draft copy
elsewhere. The EPRP is the **newest** supplied file and yet is
`draft_pending_review` / `pending_not_binding` — its own text states
*"EPRP v0.3 - LEADERSHIP REVIEW DRAFT"*, *"Effective Date: Upon formal
approval"*, and *"This EPRP becomes effective only after formal
approval."* Retrieval never infers authority from recency or filename —
only from what the source itself states (see `parsePnp.ts` / `parseEprp.ts`).

## The shared §558 section-number namespace

Serve's P&P is organized by the same section numbers as Texas PAS
(`serve_pnp` §245 ↔ `texas_pas` §558.245). `knowledge_sections.section_number`
stores the **bare** number ("245") for both, making it a first-class,
deterministic cross-reference key — not a side effect of full-text
ranking.

The EPRP and the §558.255 Occupations Code cross-reference use their own
internal numbering (EPRP: "1".."9", "4.1", "4.2"; the statute: "102.001"),
which is deliberately **namespaced** (`EPRP-1`, `OCC-102.001` — see
`lib/askServe/knowledge/sectionNumbers.ts`) so it can never collide with,
or be silently paired against, an unrelated bare §558 number (EPRP
section "1" is *not* §558.1). Their relationship to the shared namespace
is instead recorded explicitly, once, at the document level
(`knowledge_documents.related_section_number` — EPRP → `"256"`, the
Occupations Code cross-reference → `"255"`), never inferred from their
own per-subsection headings.

## Ingestion

`npm run knowledge:ingest` (`scripts/ingest-ask-serve-knowledge.ts`):

1. Parses all three source types deterministically from their actual
   document structure — never arbitrary token windows:
   - **P&P**: primary boundary = a bold paragraph beginning with a
     2-3 digit number (matches the source's own numbering convention);
     secondary boundary = any other bold paragraph within a section, for
     sub-chunking an unusually large section (e.g. §245's job
     descriptions) while every sub-chunk still carries its parent
     `section_number`.
   - **Texas PAS**: one PDF = one section, never further split (even the
     18-page §558.2 Definitions) — each PDF is already a complete,
     citation-bounded regulation.
   - **EPRP**: Word's own `Heading1`/`Heading2` styles (this document, unlike
     the P&P, actually uses them) — not forced into §558-style numbering
     it doesn't have.
2. Builds the source-coverage manifest (see below).
3. Writes `knowledge_documents`/`knowledge_sections` via Supabase, when
   `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set — skipped
   with a clear message otherwise, so parsing and the manifest can be
   regenerated and inspected without write access.

Idempotent: `knowledge_documents` is upserted by `source_path` (unique);
a document's sections are always fully replaced from its freshly parsed
content, never diffed row-by-row — correct because a section has no
identity independent of its parsing (see `lib/data/knowledgeSections.ts`).
Re-running against an unchanged corpus reproduces the same rows.

### PDF/DOCX extraction

- **DOCX**: a `.docx` is a ZIP archive; Node's built-in `zlib` already
  implements the raw DEFLATE codec ZIP uses, so the only missing piece was
  the ZIP container format itself (a small, stable, well-specified binary
  format) — implemented directly in `lib/askServe/knowledge/docxZip.ts`
  rather than adding a dependency for it.
- **PDF**: real PDF text extraction (cross-reference tables, compressed
  content streams, font encodings) is not a reasonably hand-rollable
  format the way ZIP is. `unpdf` was added as a dependency — pure
  JavaScript, zero required dependencies (confirmed: no native bindings
  are pulled in for text extraction), built specifically for serverless/Node
  environments, single-purpose (text/link/image extraction, nothing else).
  `pdf-parse` (the more commonly reached-for package) was considered and
  rejected: its current major version pulls in `@napi-rs/canvas` (a native
  binding for image rendering this feature doesn't need); its older,
  lighter `1.x` line is unmaintained since ~2019.

### Known source conditions (§287 duplication)

The P&P repeats its "Client Satisfaction Survey Policy" content twice —
once as its own out-of-sequence top-level `287` heading, and again,
materially equivalent, embedded inside the correctly-ordered `287 Quality
Assessment and Performance Improvement` section. Ingestion detects this
deterministically (any bare section number occurring in more than one
primary-heading occurrence is the anomaly signal — every other number in
this document occurs exactly once), compares the two occurrences'
content, and — since they clear a similarity threshold — keeps the
properly-integrated QAPI copy and drops the orphaned standalone one,
recording exactly what happened in both the parsed document's `warnings`
and `sourceMetadata.deduplication`, and in the coverage manifest. A
non-matching pair is never silently resolved — both are kept and flagged
for human review instead. See `lib/askServe/knowledge/parsePnp.ts`'s
`deduplicateChunks`.

## Source-coverage manifest

Every ingestion run writes `docs/architecture/ask-serve-knowledge-coverage-manifest.json`
— generated fresh each time from the actual parsed documents, never hand-
maintained. It records:

- Document/section counts per source type.
- Files deliberately excluded (the combined Texas PDF) and why.
- Every P&P ↔ Texas PAS section-number **gap** — a number present in only
  one of the two sources — each with an explanation. Three gaps have a
  specific, known, business-justified explanation baked into
  `lib/askServe/knowledge/coverageManifest.ts`:
  - **§297** (Receipt of Physician Orders) and **§302** (Pronouncement of
    Death): no Texas PAS source PDF exists for either, and none is
    expected — Serve is PAS-only/non-medical, and its P&P sections for
    both are clean non-applicability statements. An intentional Serve
    operating boundary, not a missing source.
  - **§251** (Peer Review): no Texas PAS source PDF exists — a known
    regulatory-source availability/versioning condition (the current TAC
    viewer does not currently expose §558.251 as an individually
    downloadable rule, compounded by current rulemaking activity), not
    fabricated and not treated as missing. Serve's P&P §251 remains
    retrievable as Serve policy on its own.
  - Every other gap (the ~15 Texas PAS sections — definitions,
    administrative/licensing structure — with no P&P counterpart) gets a
    generic "needs review" note, so a genuinely new, unexplained gap is
    never silently absorbed into the three known ones.
- Deduplication notes (the §287 case) and every parser warning, with
  source attribution.

This exists specifically so a deliberate exclusion is never later
mistaken for something ingestion silently missed.

## Retrieval

`lib/askServe/retrieval.ts` — `retrieveKnowledgeEvidence(question, { limit? })` —
is the only entry point the next slice (LLM answer synthesis) should call.
Returns `KnowledgeEvidence[]`: exact source excerpts with full provenance
(`KnowledgeCitation` — source type, document, section number/title,
status, authority, effective date). **Never** a generated answer.

Ranking (`lib/askServe/knowledge/rankSections.ts`, pure — see Testing
below) combines, in order:

1. **Explicit section-number reference** — "§245" / "section 245" in the
   question directly selects that section (score 1.0, `matchReason:
   "section_number_match"`).
2. **Text relevance** — IDF-weighted term-overlap scoring
   (`lib/askServe/knowledge/textRelevance.ts`). A term common to nearly
   every section (e.g. "office") is down-weighted so it can't alone clear
   the relevance floor; a multi-term question matching on only one
   low-distinctiveness term is rejected outright (this is what keeps an
   out-of-scope question like "What is the office WiFi password?"
   returning no evidence rather than a spurious match). No stemming
   library is used — a lightweight shared-prefix match (≥5 characters)
   covers the common inflections these questions actually produce
   ("reassess"/"reassessed", "assisting"/"assistance") without the
   false-positive risk of a suffix-stripping stemmer.
3. **Section context** — once any sub-chunk of a multi-part P&P/Texas PAS
   section is matched, its sibling sub-chunks are included too
   (`matchReason: "section_context"`). This exists specifically because a
   question can share enough words with only one sibling of a section
   while another sibling — equally necessary for a complete, safe answer —
   doesn't independently clear the relevance floor. Concretely: P&P §281's
   "List of Services" (what a caregiver may do, including "assistance with
   self administration of medications") and "Services Serve Does Not
   Provide" (the prohibition on "administration of any prescription
   medication") are siblings; a medication-assistance question must
   surface both, not just whichever one happens to share more literal
   words with the question.
4. **Deterministic cross-reference pairing** — every included P&P/Texas
   PAS match is paired with its identical-bare-number counterpart in the
   other source, when one exists in the corpus (`matchReason:
   "cross_reference_pair"`). Never fabricated: §297/§302's Texas PAS side
   simply doesn't exist and is never invented.

### Why fetch-all-then-rank-in-process, given a real Postgres FTS column exists

`knowledge_sections.search_vector` is a real, standard `tsvector` +
`GIN`-indexed column (see the migration), and
`lib/data/knowledgeSections.ts#searchKnowledgeSectionsByText` uses it via
Supabase's `.textSearch(..., { type: "websearch" })` — implemented and
available. `lib/askServe/retrieval.ts` does not currently call it as the
primary candidate path: the v0.1 corpus is small (~170 rows total across
all four source types), cheap to fetch in full and rank deterministically
with the same logic this feature's tests exercise directly against real
content. Wiring `searchKnowledgeSectionsByText` in as the primary
candidate-narrowing step, once corpus size stops making fetch-all
reasonable, is expected future work — not a gap being hidden here.

### Retrieval trust rules (enforced by construction, not by a filter)

- Never blends P&P and Texas text into one citation — every
  `KnowledgeEvidence` carries exactly one source type.
- Never fabricates a citation for a section that doesn't exist in the
  corpus — cross-reference pairing only adds a pair when one is actually
  found.
- Never filters out non-binding evidence (e.g. the EPRP) — it is
  returned, honestly labeled via `citation.sourceStatus` /
  `citation.operationalAuthority`, so the next slice's interpretation
  layer decides how to present it, rather than retrieval silently hiding
  it or silently upgrading its authority.
- Never surfaces draft Background Eligibility governance — structurally
  guaranteed, since that corpus was never ingested into this schema at
  all in this slice (out of scope), not filtered post hoc.

## Adding or superseding a source later

1. Add the new/updated file under the appropriate source directory (or
   replace the existing single file under `policies/`/`controlled-procedures/`).
2. Re-run `npm run knowledge:ingest`. `knowledge_documents` is upserted by
   `source_path`; if the path is unchanged, the row (and all its sections)
   is simply updated in place. A genuinely new document at a new path
   should instead set `supersedes_document_id` pointing at the prior
   version's id (not yet automated — a deliberate, reviewed step, matching
   this codebase's established supersession convention of never
   overwriting provenance) and give it `source_status: "superseded"`.
3. If the new document's actual review/approval status differs from what
   `parsePnp.ts`/`parseEprp.ts`/`parseTexasPas.ts` currently assume (e.g.
   the EPRP is formally approved), update the relevant parser's
   status-detection logic — never hand-edit a `knowledge_documents` row's
   `operational_authority` directly, since the next ingestion run would
   silently overwrite it back to whatever the parser (still) infers from
   the source.

## Testing

Following this codebase's established convention (see the header comment
in `lib/compliance/__tests__/auditReadinessDashboard.test.ts`): pure logic
is unit-tested directly; DB-touching orchestration is live-verified, not
mocked.

- `lib/askServe/knowledge/__tests__/*.test.ts` — parsing, section-number
  handling, relevance scoring, and the coverage manifest, all pure.
  `parsePnp.test.ts`/`parseEprp.test.ts`/`parseTexasPas.test.ts` parse the
  **real, checked-in source files** (not synthetic fixtures) — proving the
  actual current corpus, not a stand-in for it.
- `lib/askServe/knowledge/__tests__/knowledgeQuestions.test.ts` — the 10
  representative questions for this slice, run through the real ranking
  algorithm over the real, fully parsed corpus, entirely in-process with
  no database. This is retrieval validation without a live Supabase
  instance being available in every environment this runs in.
- `scripts/verify-ask-serve-knowledge-retrieval.ts` — the same 10
  questions, live, against the real Supabase-backed
  `retrieveKnowledgeEvidence()`, once ingestion has run against a real
  database. This is what actually proves the DB-touching path
  (`lib/data/knowledgeDocuments.ts`, `lib/data/knowledgeSections.ts`,
  `lib/askServe/retrieval.ts`) works end to end.

Run all of this slice's unit tests: `npm run test:askServeKnowledge`.
