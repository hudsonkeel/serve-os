// A small, dependency-free relevance scorer. Not a reimplementation of
// Postgres's websearch_to_tsquery/ts_rank_cd (the DB-backed retrieval path
// uses those directly via Supabase's .textSearch(), see
// lib/data/knowledgeSections.ts) — this exists because the same ranking
// decision (which sections best match a question) also needs to run
// deterministically in-process: over a small, already-fetched candidate
// set in production (this corpus is ~90 rows, cheap to rank in Node), and
// standalone in tests with no database available at all. Simple term-
// overlap-with-frequency scoring, not statistical-corpus-aware (no IDF) —
// appropriate at this corpus size, where "does this section actually
// contain the words in the question" is most of the signal.

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does",
  "for", "from", "how", "if", "in", "into", "is", "it", "its", "of", "on",
  "or", "our", "should", "so", "than", "that", "the", "their", "there",
  "these", "this", "to", "was", "we", "what", "when", "where", "which",
  "who", "will", "with", "without",
  // Natural-language question filler this domain's operational questions
  // routinely use ("How OFTEN do we NEED to...", "What DO we DO
  // regarding...") — not meaningfully distinguishing content on their
  // own, and diluting the signal from the term that actually is (e.g.
  // "reassess") when left unfiltered.
  "often", "need", "needed", "needs", "must", "required", "require",
  "did", "would", "could", "about", "us", "regarding",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

// No stemming is applied in tokenize() — Postgres's real FTS path
// (to_tsvector/websearch_to_tsquery) stems via its English dictionary
// (so "reassess"/"reassessed" and "assist"/"assisting"/"assistance" are
// each the same lexeme there), but reimplementing a real stemmer here
// would be exactly the kind of unjustified complexity this feature is
// meant to avoid. Instead, a term is considered present in a document if
// an exact match exists OR the two terms share a sufficiently long
// (>=5 char) common prefix — covers both a word being a strict
// extension of another ("reassess"/"reassessed") and two inflections
// that diverge from a shared stem ("assisting"/"assistance", both from
// "assist"), without the false-positive risk of a suffix-stripping
// stemmer on short or irregular words.
const MIN_PREFIX_MATCH_LENGTH = 5;

function sharedPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

function isRelatedTerm(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < MIN_PREFIX_MATCH_LENGTH || b.length < MIN_PREFIX_MATCH_LENGTH) return false;
  return sharedPrefixLength(a, b) >= MIN_PREFIX_MATCH_LENGTH;
}

/** Total occurrences in `docTermCounts` of any term related to `term`
 *  (exact match or a qualifying shared prefix — see isRelatedTerm). */
function relatedTermCount(term: string, docTermCounts: Map<string, number>): number {
  const exact = docTermCounts.get(term);
  if (exact !== undefined) return exact;
  let total = 0;
  for (const [docTerm, count] of docTermCounts) {
    if (isRelatedTerm(term, docTerm)) total += count;
  }
  return total;
}

export interface TermWeights {
  idf: Map<string, number>;
  /** Weight for a query term that never appears verbatim anywhere in the
   *  corpus (only reachable via the prefix-match fallback — see
   *  isRelatedTerm). By construction such a term is at least as rare as
   *  any term actually observed (df >= 1), so it is weighted as if
   *  df = 1 — the most distinctive a present term can be — rather than a
   *  flat default that would under-weight it relative to common words
   *  that DO have a (lower) real idf entry. This matters concretely: a
   *  query using "reassess" against a corpus that only ever writes
   *  "reassessed" must not have "reassess" treated as less distinctive
   *  than "client", which appears in nearly every section. */
  unseenTermWeight: number;
}

/** Document frequency (inverse) weights, computed once over the whole
 *  candidate corpus. Without this, a word common to nearly every section
 *  in an operations policy manual (e.g. "office", "client", "service")
 *  can dominate a score purely by appearing everywhere, producing a false
 *  match for a question that shares no meaningful term with the corpus at
 *  all (verified: without IDF, "What is the office WiFi password?" scored
 *  several unrelated sections above the relevance floor on nothing but
 *  the word "office"). Standard log(1 + N/df) form — a term in every
 *  document approaches a low, non-zero floor rather than being erased. */
export function computeInverseDocumentFrequency(documentTexts: string[]): TermWeights {
  const documentFrequency = new Map<string, number>();
  for (const text of documentTexts) {
    const uniqueTerms = new Set(tokenize(text));
    for (const term of uniqueTerms) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  const idf = new Map<string, number>();
  const n = documentTexts.length;
  for (const [term, df] of documentFrequency) {
    idf.set(term, Math.log(1 + n / df));
  }
  return { idf, unseenTermWeight: Math.log(1 + n) };
}

/** Raw (unnormalized) relevance score of `documentText` against
 *  `queryTokens`, weighted by `idf` (see computeInverseDocumentFrequency
 *  — pass an empty map to fall back to unweighted/uniform scoring).
 *  Higher is more relevant; 0 means no query term appears in the
 *  document. */
export function scoreRelevance(queryTokens: string[], documentText: string, weights: TermWeights = { idf: new Map(), unseenTermWeight: 1 }): number {
  const uniqueQueryTerms = new Set(queryTokens);
  if (uniqueQueryTerms.size === 0) return 0;

  const docTokens = tokenize(documentText);
  const docTermCounts = countTerms(docTokens);

  let matchedTerms = 0;
  let matchedUniqueIdfWeight = 0;
  let totalIdfWeight = 0;
  let weightedSum = 0;
  for (const term of uniqueQueryTerms) {
    const weight = weights.idf.get(term) ?? weights.unseenTermWeight;
    totalIdfWeight += weight;
    const count = relatedTermCount(term, docTermCounts);
    if (count > 0) {
      matchedTerms += 1;
      matchedUniqueIdfWeight += weight;
      weightedSum += weight * (1 + Math.log(count));
    }
  }

  if (matchedUniqueIdfWeight === 0) return 0;
  // A multi-term question that overlaps the document on only one
  // (possibly common, low-distinctiveness) term is not real evidence of
  // relevance — without this, a question entirely outside the corpus
  // (e.g. "What is the office WiFi password?") can still clear the
  // relevance floor purely because "office" appears throughout an
  // operations policy manual. A single-term query is exempt — it has
  // nothing else to corroborate against.
  if (uniqueQueryTerms.size > 1 && matchedTerms < 2) return 0;

  // IDF-weighted coverage: matching one highly distinctive term counts
  // for much more than matching one term that appears in nearly every
  // section (e.g. "office").
  const coverage = matchedUniqueIdfWeight / totalIdfWeight;
  // Mild length penalty so a short, on-topic section isn't drowned out by
  // a long section that merely contains the same terms incidentally.
  const lengthPenalty = 1 / (1 + Math.log(1 + docTokens.length));

  return coverage * weightedSum * lengthPenalty;
}

/** Normalizes a set of raw scores to 0-1 by dividing by the maximum
 *  (0 when every score is 0). Ranking is relative within one question's
 *  candidate set, so this is done per-call, not against a global corpus. */
export function normalizeScores(scores: number[]): number[] {
  const max = Math.max(0, ...scores);
  if (max === 0) return scores.map(() => 0);
  return scores.map((s) => s / max);
}
