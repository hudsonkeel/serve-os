# Serve Intelligence Engineering Standards

*The [Constitution](./SERVE_INTELLIGENCE_CONSTITUTION.md) defines why the Serve Intelligence Platform exists. `ARCHITECTURE.md` defines what it is. `lib/intelligence/core/` defines its structure. **This document defines how engineers — human or AI — build on it.** Any future session implementing a new intelligence domain should be able to do so correctly by following this document alone, without re-deriving decisions already made here.*

If anything in this document ever conflicts with the Constitution, the Constitution wins — fix this document, don't reinterpret the Constitution.

---

## Section 1 — Engineering Philosophy

Every implementation decision in this platform should be checked against these, in order:

- **Deterministic before AI.** If a Rule can decide it, a Rule decides it. AI is never the fallback for a Rule that's merely inconvenient to write.
- **Evidence before recommendation.** No Recommendation exists without a Signal, no Signal without Evidence, no Evidence without a Fact (or a prior Signal, for aggregation rules). Never skip a layer.
- **Explanation before automation.** If you can't explain why something fired, it isn't ready to ship, no matter how useful it seems.
- **Reuse shared primitives.** A new domain contributes Rules and Fact mappings into the platform. It does not invent its own version of a primitive that already exists.
- **Avoid duplicate reasoning.** The same question ("is this resident okay," "is this caregiver reliable") should be answered by one Rule, consulted everywhere, not re-derived independently in three UI components.
- **Favor small, trustworthy vertical slices.** A rule set that fires rarely but is always right beats a rule set that fires constantly and is sometimes wrong. See the Scheduling Intelligence V1 requirements for a worked example of narrowing scope on purpose.
- **Preserve auditability.** Every primitive this platform produces should be reconstructable months later: what triggered it, what it was based on, and what happened after.
- **Optimize for operational usefulness.** A Signal that neither changes a decision nor improves organizational understanding is overhead, not intelligence. If a candidate Rule can't clear this bar, it doesn't ship — see Section 5's "when a Signal should not exist."

---

## Section 2 — Rule Engineering Standard

Every Rule, in every domain, is documented and reviewed using exactly this shape before it is implemented. This is the same shape used to finalize Scheduling Intelligence V1 — treat that document as the worked example of this template in practice.

```
### <domain>.<rule_slug>

**Purpose**
One sentence: what real operational question does this answer?

**Business Value**
Why does this matter to Serve, a resident, a family, or a caregiver — concretely,
not "provides insight."

**Subject**
Which SubjectType does the resulting Signal attach to? (Not necessarily the
same as who/what the Rule reads data about.)

**Trigger Type**
event | state | time — see shared vocabulary in lib/intelligence/core/rules.ts.

**Inputs**
- Required Facts: exact factType(s), and which fields of their payload are used.
- Required Reference Knowledge: exact attribute_key(s), if any (Phase E+ only —
  a Rule with no Reference Knowledge dependency should say "none," not omit
  the line).

**Thresholds**
Every tunable parameter, its default, and whether the default is
Hud-approved or still proposed. Thresholds live in RuleVersion.parameters,
never hardcoded in logic.

**Deterministic Logic**
The exact condition, in plain language precise enough to implement without
guessing. If it can't be stated this precisely, it isn't ready to write code
for yet.

**Evidence Produced**
Which Fact(s) / Reference Knowledge row(s) / Signal(s) does this Rule cite as
Evidence for what it produces?

**Signal Produced**
signalType, severity, and the condition under which it's produced (vs. not).

**Recommendation Produced**
Yes / No / Rolled up. If No — this Signal is informational-only; say where it
surfaces instead (Dashboard, Community Intelligence, a Residents-page
timeline entry).

**Recommendation Priority**
Derived from Signal severity — never invented separately (see Section 6).

**Explanation Template**
The deterministic "what happened" / "why flagged" template text, with
placeholders. This is what ships in Explanation.deterministic — write it now,
in this document, before implementation, not as an afterthought once the
Rule already exists.

**False Positive Risks**
Named explicitly, not hand-waved. What real, benign situation could trigger
this Rule wrongly, and how does the Recommendation's wording avoid
overclaiming despite that risk?

**Exceptions**
What must this Rule never do, even if the trigger condition is technically
met? (e.g. never fire on a removed record, never infer a status the source
data doesn't prove.)

**Lifecycle**
- Resolution: automatic (condition becomes false) and/or human-triggered —
  say which, and under what condition.
- Expiration: the time-based fallback if no one resolves it.

**Audit Requirements**
Anything beyond the platform's standard Rule Run logging that this specific
Rule needs recorded.

**Future AI Opportunities**
Where, if anywhere, AI could eventually assist this Rule's *presentation*
(never its *evaluation*) — drafting, summarizing, prioritizing among several
open instances. If none, say "none identified."

**Success Metrics**
How you'll know, after this ships, whether it was worth building.
```

A Rule proposal missing any section above is not ready for implementation review — return it, don't fill in gaps for a future engineer.

---

## Section 3 — Fact Engineering Standard

- **Naming:** `<domain>.<event_in_past_or_completed_form>` — Facts describe something that already happened. Prefer `visit_started`, `visit_completed`, `assessment_completed` over vaguer nouns like `visit_status` or `update`.
- **Namespaces:** the domain prefix must be one of `lib/intelligence/core/shared.ts`'s `KNOWN_INTELLIGENCE_DOMAINS`, or that list is extended first, deliberately, in its own change — never introduce a new domain prefix silently inside a Fact type name.
- **Payload philosophy:** minimum necessary, already normalized, computed once at write time (store the delta, e.g. `latenessMinutes`, not just raw timestamps a reader must re-derive it from). Display identity (name) is fine; nothing beyond it ever belongs in a payload — see the AxisCare integration's existing, structurally-enforced privacy boundary as the reference standard.
- **Minimum necessary data:** if a field isn't read by at least one Rule or needed to render an Explanation, it doesn't belong in the payload. Do not add a field "in case it's useful later" — that's speculative modeling, addressed and rejected in Section 1.
- **Immutability:** never edit a Fact. Ever. Not for a typo, not for a vendor correction, not for a schema migration convenience.
- **Corrections:** a corrected Fact is a *new* Fact with `supersedesFactId` pointing at the one it corrects. Detecting "this value changed since we last recorded it" (vs. "this value newly appeared") is Rule Engine responsibility, not a database trigger — be explicit in a Rule's design about which case it's handling.
- **Provenance:** `sourceSystem`, `sourceRecordId`, and `provenanceConfidence` are required on every Fact, never optional, never defaulted to `"unknown"` out of laziness — if a Rule genuinely can't determine confidence, that's a real modeling gap worth surfacing, not silently swallowing.
- **Deduplication:** define `(factType, <natural key>)` as the dedup identity before writing any code — usually a vendor's own record id. Prefer **transition-triggered** Facts (written when a value newly appears or changes) over periodic snapshots — a snapshot-on-every-poll design turns the Fact stream into a polling log instead of an event log and inflates storage for no reasoning benefit. See the Scheduling Intelligence V1 requirements for the worked-out reasoning behind this preference.
- **Retention philosophy:** retention is a policy question for Hud, not an engineering default. Every new Fact type proposal should explicitly flag "retention: undecided, needs approval" rather than picking a number.

---

## Section 4 — Reference Knowledge Standard

*Deferred to Phase E — no table exists yet. Standards defined now so Phase E doesn't have to re-derive them under implementation pressure.*

- **Current value:** modeled as a slowly-changing dimension (SCD Type 2) — every change is a *new row* with `valid_from`/`valid_to`; the current value is the row where `valid_to IS NULL`. Never an in-place `UPDATE` of the value column.
- **History:** every prior value remains queryable forever from the same table — no separate archive table, no destructive supersession.
- **Attribute naming:** `<concept>.<attribute>`, grouped by concept prefix, e.g. `contact.primary_phone`, `preferences.communication_method`, `relationships.pcp`, `demographics.birth_date`. Not domain-prefixed the way Facts/Signals are — Reference Knowledge describes a *subject*, not an *event a domain observed*, so it shouldn't imply ownership by whichever domain happened to write it first.
- **Ownership:** document, per attribute key, which domain is the *primary* writer (even though any domain may read any attribute). Two domains silently fighting over the same attribute key is a design defect to catch in review, not something to discover in production.
- **Validation:** every attribute has a declared expected shape (string, enum, date, etc.) checked before write — no free-form garbage accepted into a value column just because the table is schemaless-feeling.
- **Source precedence** when two sources disagree on the same attribute at the same time: explicit human correction outranks vendor sync, which outranks an LLM-proposed-and-human-approved value, which outranks an inferred default. Encode this precedence explicitly in whatever writes Reference Knowledge — never "last write wins" by accident.
- **Human approval:** required before any AI-proposed Reference Knowledge value persists, no exception — already established in the Constitution, restated here as an engineering requirement, not just a principle.
- **Vendor synchronization:** a vendor-sourced Reference Knowledge update must also emit the bridging Historical Fact (`<domain>.reference_knowledge_changed` or equivalent) established in the refined architecture, so event-triggered Rules never need to poll Reference Knowledge directly to notice a change.

---

## Section 5 — Signal Engineering Standard

**A Signal should exist when** a deterministic Rule has evidenced a specific, real condition that either (a) warrants a human decision, or (b) has genuine value as an aggregate/trend even with no individual action attached. Both are legitimate; a Signal is not required to lead to a Recommendation.

**A Signal should NOT exist when:**
- No Rule can evidence it deterministically yet (don't create a placeholder Signal "for later").
- Nothing consumes it — no Recommendation, no aggregate view, no Residents-page timeline entry. A Signal with no defined consumer is dead weight; name its consumer in the Rule proposal (Section 2) before building it.
- It would duplicate a condition another Signal already captures under a different name.

- **Naming:** `<domain>.<condition, present tense>` — Signals describe a current state, not a past event, which is what separates their naming from Facts': `visit_started_late`, `touch_overdue`, `pipeline_stalled`.
- **Severity:** always one of the shared `SignalSeverity` values (`routine` | `monitor` | `important` | `urgent`, per `lib/intelligence/core/signals.ts`). Never invent a domain-specific severity scale — document the mapping from this Rule's condition to one of the four in the Rule's proposal, and justify it (see Section 2's "Recommendation Priority," which derives from this).
- **Lifecycle:** `active` on creation, `resolved` (automatically or by a human) or `expired` (time-based fallback, always defined per-Rule) afterward. Never deleted.
- **Aggregation:** a composite/rollup Signal (e.g. a Community-Intelligence-style pattern across residents) is Evidenced by the *constituent Signals themselves*, using Evidence's `"signal"` reference kind — this is standard platform machinery, not a special case. See Section 1's "avoid duplicate reasoning": a rollup Rule is still just a Rule, run through the same engine, evidencing Signals instead of Facts.
- **Resolution:** define explicitly, per Rule, whether resolution is automatic (the underlying condition becomes false on a later evaluation) or requires a human action. Don't leave this implicit.
- **Expiration:** every Signal needs a time-based fallback expiration, even if resolution is expected to usually happen first — an unresolved Signal must not accumulate forever as "active."

**Deduplication is mandatory, not optional.** A Rule that re-evaluates every few minutes (or on every page load) must check for an existing active Signal matching `(signalType, subject, <natural key>)` before creating a new one. A Rule proposal that doesn't specify its natural key is not implementation-ready.

---

## Section 6 — Recommendation Engineering Standard

**Recommendation fatigue is a real failure mode.** A platform that recommends everything gets ignored for everything. Every Recommendation must earn its place.

**A Recommendation should exist when** a Signal represents something a human can meaningfully act on *today or soon*, and acting on it changes an outcome. **It should remain informational-only (Signal without Recommendation)** when the condition is real but not individually actionable — better suited to a trend, an aggregate, or a "worth knowing" surface than a task. `scheduling.visit_duration_variance` in the Scheduling Intelligence V1 requirements is the reference example of this choice: real, evidenced, but deliberately not turned into a per-visit task.

- **Priority:** always derived from the originating Signal's severity — a Recommendation never has an independently-set priority that disagrees with the Signal(s) behind it.
- **Grouping / Aggregation:** when multiple Signals share a subject, timeframe, and pattern (e.g. several `visit_started_late` Signals for the same caregiver), roll them into **one** Recommendation, not one per contributing Signal. State the rollup key explicitly in the Rule proposal.
- **Dismissal / Acceptance:** status transitions only a human performs — see Section 7, since acceptance is what creates an Action.
- **Escalation:** a Recommendation does not silently escalate itself. If a dismissed-then-recurring condition should be treated as more urgent, that's a *new Rule Version's parameters* deciding that, reviewed by a human — never automatic self-escalation within the platform's runtime. This mirrors the Constitution's Article IX: the platform does not rewrite its own rules.

---

## Section 7 — Action Engineering Standard

- **Human ownership:** every Action has a human owner in spirit even when `assignedTo` is null at creation — an unassigned Action is still someone's eventual responsibility, not the system's.
- **Assignment:** `assignedTo` is optional at creation, encouraged before an Action is considered actively worked.
- **Due dates:** set relative to the originating Signal's severity/urgency where one exists (a `visit_not_started` Action needs a same-day due date; a `visit_duration_variance` rollup, if one ever exists, does not). Manual Actions set their own due date at the human's discretion.
- **Status:** the shared `ActionStatus` vocabulary only (`open` | `in_progress` | `completed` | `dismissed` | `cancelled`, per `lib/intelligence/core/actions.ts`) — never a domain-specific status list.
- **Manual Actions** (`recommendationId: null`) are first-class, not a lesser category — someone starting work directly, without waiting for the platform to notice something, is exactly the kind of human judgment the Constitution protects. Do not build UI or reporting that treats manual Actions as an afterthought.
- **Recommendation-created Actions** (`recommendationId` set) inherit their subject and suggested priority from the Recommendation, but the human may adjust assignment/due date/priority freely once the Action exists — accepting a Recommendation is not a promise to execute it exactly as suggested.

---

## Section 8 — Outcome Engineering Standard

- **Vocabulary:** the shared `OutcomeType` only (`accepted` | `completed` | `dismissed` | `deferred` | `expired`, per `lib/intelligence/core/actions.ts`) — never extended per-domain.
- **Append-only history:** an Outcome is never edited or deleted. If a recorded Outcome turns out to be wrong, record a *new* Outcome with a note explaining the correction — the same immutability discipline as Historical Facts, for the same reason: the record of what a human believed and did at the time must survive later corrections.
- **Learning:** aggregate Outcome data (e.g. "80% of this Rule's Recommendations get dismissed") is a legitimate, encouraged input to a **human's** decision about whether a Rule Version needs new parameters or should be retired. It is never, under any circumstance, an automatic input that changes Rule behavior at runtime — see Constitution Article IX, restated here as a hard engineering constraint, not a suggestion.
- **Rule evaluation / future optimization:** recommend a periodic (e.g. quarterly, per domain, at Hud's discretion — not decided here) human review of Outcome aggregates grouped by `ruleVersionId`, as the concrete mechanism for the Constitution's "better review → better Rule Versions" loop. This is a practice to establish, not a primitive to build — no new stored primitive is needed for it (see the layered architecture reconciliation's explicit rejection of a separate "Rule Performance" primitive).

---

## Section 9 — AI Engineering Standard

**Where AI belongs:**
- **Context consumption:** an LLM reads an *assembled Context Bundle* (relevant Reference Knowledge + relevant Context Notes + relevant recent Facts, already retrieved deterministically and scoped to one subject) — never a raw table scan, never another subject's data, never facts irrelevant to the task at hand.
- **Drafting:** LLM output may populate `ExplanationNarrative`'s fields (`summary`, `recommendedConsideration`) and Recommendation-adjacent message copy. It must never touch `ExplanationDeterministicCore` (`whatHappened`, `whyFlagged`, `evidenceRefs`, `ruleVersionId`) — that split exists in the Phase A types specifically to make this boundary impossible to blur by accident.
- **Summarizing:** condensing several Facts/Signals into readable prose is fine — every claim in the summary must still cite back to real Evidence; an LLM summary that asserts something no Fact supports is a defect, not a stylistic choice.
- **Personalizing:** using Context (a resident's preferences, a relationship note) to adjust *tone and wording* is exactly the platform's intended use of Context — see the Constitution's Richard/Baylor-football example. Personalization changes *how* something is said, never *what* is recommended.
- **Explaining:** the narrative half of an Explanation, always marked `aiAssisted: true` when AI touched it, never silently.

**Where AI is prohibited, absolutely:**
- Creating a Historical Fact.
- Creating or evaluating a Signal.
- Performing Rule evaluation of any kind.
- Assigning an operational classification, a compliance decision, a scheduling decision, or a pricing calculation.
- Writing to any vendor system.
- Authoring or editing a Rule or Rule Version (a stricter line than Reference Knowledge/Context Note — see the layered reconciliation's reasoning: Rule authorship changes the system's own logic, a materially different act than recording a fact about one resident).

**How AI should never classify:** an LLM's output must never be assigned directly to a `factType`, `signalType`, `recommendationType`, `ActionStatus`, `SignalSeverity`, or any other closed vocabulary field on a platform primitive. If a feature seems to need an LLM to "decide which category this is," that categorization belongs in a Rule, not a prompt — bring it back to Section 2 and design it as deterministic logic instead.

---

## Section 10 — Naming Standards

| Primitive | Pattern | Example |
|---|---|---|
| Fact | `<domain>.<event, past/completed form>` | `scheduling.visit_completed` |
| Signal | `<domain>.<condition, present form>` | `scheduling.visit_started_late` |
| Recommendation | `<domain>.<recommended action, imperative-adjacent>` | `scheduling.review_late_visit` |
| Action | Same style as the Recommendation it's usually created from | `scheduling.coverage_check_in` |
| Rule (`slug`) | `<condition_name>`, matches its Signal's suffix, no domain prefix (domain is its own field) | `visit_started_late` |
| Rule Version (`logicReference`) | `lib/intelligence/domains/<domain>/rules/<ruleSlug>.ts@<version>` | `lib/intelligence/domains/scheduling/rules/visitStartedLate.ts@1` |
| Explanation template | Named and versioned alongside its Rule Version — not a separately-numbered artifact | — |
| Namespace (`IntelligenceDomain`) | Must appear in `KNOWN_INTELLIGENCE_DOMAINS` (`lib/intelligence/core/shared.ts`) before use in any Fact/Signal/Recommendation type string | `scheduling`, `relationship`, ... |
| Files | `camelCase.ts`, matching this repo's existing convention throughout `lib/` | `visitStartedLate.ts` |
| Folders | `lib/intelligence/domains/<domain>/` for each domain; `rules/`, `facts.ts` within it | `lib/intelligence/domains/scheduling/rules/` |

A namespaced identifier that doesn't start with a known domain is a review-blocking defect, not a style nitpick — it's the one piece of naming discipline the type system itself partially enforces (see `NamespacedIdentifier` in `lib/intelligence/core/shared.ts`).

---

## Section 11 — Implementation Checklist

Every intelligence capability completes this checklist before merge:

- [ ] Rule fully documented using the Section 2 template — every field filled, none skipped.
- [ ] Fact type(s) named, namespaced, and payload-minimized per Section 3.
- [ ] Deduplication key defined for every Fact and every Signal.
- [ ] Signal severity justified against the shared `SignalSeverity` scale, not invented.
- [ ] Recommendation-vs-informational-only decision made explicitly and documented, per Section 6.
- [ ] Evidence links every Signal to a real Fact, Reference Knowledge row, or constituent Signal — never a bare assertion.
- [ ] Explanation template written and reviewed *before* implementation, not drafted after the fact.
- [ ] Explanation's deterministic/narrative split respected in code — no field ever crosses it.
- [ ] False positives named explicitly, and Recommendation/Explanation copy checked against them (never overclaims beyond what the evidence supports).
- [ ] Lifecycle (resolution + expiration) defined for every Signal and Recommendation this Rule produces.
- [ ] Audit requirements confirmed — Rule Run logging in place, `ruleVersionId` present on every Signal/Recommendation this Rule produces.
- [ ] AI boundary confirmed — if AI is used anywhere in this feature, confirm exactly which fields it may touch and that a human-approval gate exists wherever required (Section 9).
- [ ] No raw vendor type imported into `lib/intelligence/` outside the relevant vendor adapter — verified the way `lib/intelligence/core`'s own boundary test does, by scanning for the vendor's raw type name.
- [ ] Thresholds and any other policy parameter traced to an explicit Hud approval, not an engineer's default.
- [ ] Constitution compliance confirmed — re-read the relevant Articles, don't assume memory of them is current.
- [ ] Tests added following this repository's existing convention (`node:assert`-based runtime tests; `@ts-expect-error` compile-time boundary proofs where a structural boundary is being enforced) — see `lib/intelligence/core/__tests__/` as the reference pattern.

---

## Section 12 — Definition of Done

An intelligence feature is complete — not "mostly done," not "ready to iterate on in production" — only when **all** of the following are true:

1. Every deterministic Rule it depends on is tested, including its stated false-positive exclusions.
2. Every Signal it can produce carries real, structurally-linked Evidence — never a Signal with no Evidence row.
3. Every Recommendation it can produce has a generated, reviewed Explanation, split correctly between deterministic and narrative content.
4. No code path — direct or indirect — can cause a write to any vendor system. This is verified, not assumed.
5. The feature has been checked against the Constitution and does not silently reinterpret any Article.
6. The feature has been checked against this document's Section 11 checklist, item by item.
7. Every policy parameter (threshold, severity mapping, retention, evaluation cadence, cadence-driven infrastructure) traces to an explicit Hud approval on record — not an engineer's judgment call presented as already decided.

If any of the seven is not true, the feature is not done, regardless of how much of it works.

---

## The Engineering Oath

Before implementing anything in the Serve Intelligence Platform, human or AI:

*I will ask what is true, not what would be convenient to believe.*
*I will show my evidence, not just my conclusion.*
*I will name what I do not know as clearly as what I do.*
*I will build so that anyone, months from now, can see exactly why this fired.*
*I will let a human decide what I can only recommend.*
*I will not build what does not actually help someone do their job better today.*
*I will remember that behind every Signal is a resident, a caregiver, or a family — never just a row.*
