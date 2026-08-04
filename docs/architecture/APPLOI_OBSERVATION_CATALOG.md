# Apploi Observation Catalog — Alma Dhora Owolabi (Reference Case)

**Document Type:** Observation Catalog (Phase 2 of [`APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md`](./APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md))
**Status:** Updated against a real reconnaissance session — see [`APPLOI_DOM_MAP.md`](./APPLOI_DOM_MAP.md) for the underlying evidence
**Last Updated:** 2026-07-21

**Implementation status (this phase):** four observations were promoted to a real, persisting collector — `scripts/collectors/apploiCandidateDialogCollector.ts` — after a second, dialog-scoped reconnaissance run confirmed their selectors hold across two different tab views: `apploi.candidate_name`, `apploi.position`, `apploi.resume_availability` (absent-state only), and `apploi.viventium_integration_status`. `apploi.latest_activity_at` remains approved in principle (see its row below) but was **not** implemented this phase — its confirmed selector is row-level (candidate list page), and no safe, unambiguous way to associate the correct row with the confirmed dialog was available from this session's evidence; inventing one would have meant guessing. Everything else in this catalog stays exactly as classified below (provisional or blocked) — none of it was promoted "because it looked plausible."

Every observation below answers "what operational decision could this eventually influence?" — an entry with no answer was not added. This version adds a **Status** column classifying each against real observed evidence, not assumption.

| Observation ID | Purpose | Fact Type | Status | Why |
|---|---|---|---|---|
| `apploi.candidate_exists` | Precondition for everything else | `recruiting.candidate_exists` | **Partially extractable** | Confirming existence *given an already-open, human-confirmed dialog* is automatable (dialog present + name matches). The *search* step itself (finding Alma from a list) was not exercised in this session — Hud opened her record directly — so that part remains manual. |
| `apploi.candidate_name` | Identity corroboration only — never a replacement for the human "does this match?" gate, which stays mandatory | `recruiting.candidate_name` | **Production-ready** | Dialog-scoped `h2`, excluding the Integrations tab's separate "Viventium" `h2` — stable across two different tab-view captures. Implemented in `dialogFields.ts`; extraction confidence `medium` (content-exclusion selector, not a data-testid). |
| `apploi.application_exists` | Gates application-level requirements | `recruiting.application_exists` | **Blocked** | An `h4` heading reading exactly "application" (lowercase) was observed at the end of the scan, but its content/meaning wasn't captured. Needs a targeted look at what that section actually contains. |
| `apploi.position` | Role-specific reasoning | `recruiting.position` | **Production-ready** | The dialog-scoped rerun confirmed exactly 3 `h3` elements in the dialog; excluding "Recent Experience" and "Education" leaves exactly one. Implemented in `dialogFields.ts` as a content-exclusion selector (hard-stops rather than guessing if the remainder isn't exactly one); confidence `medium`. |
| `apploi.resume_availability` | Gates resume-dependent workflows | `recruiting.resume_availability` | **Production-ready — narrow scope** | `"No resume added."` under the "Resume" `h4`, stable across two tab-view captures. Only this exact absent-state text is normalized (`not_available`); any other text returns `unknown` rather than a guessed "resume present" parse, since that state has never actually been observed. |
| `apploi.viventium_integration_status` | Direct integration-record observation only | `recruiting.viventium_integration_status` | **Production-ready** | `data-testid="noIntegrationMessage"` inside the Integrations tabpanel — a real data-testid, high confidence. Normalizes to `no_integration_record_found`. **Explicitly does not prove**: the candidate wasn't hired, no Viventium employee record exists, onboarding didn't occur, or a transfer never happened through another path. No rule currently consumes this key. |
| `apploi.applied_date` | Timeline/staleness reasoning | `recruiting.applied_date` | **Blocked** | Not observed at all — the reconnaissance tool only scans `data-testid`/ARIA/headings; a plain-text label like "Applied Jul 4" with none of those markers is invisible to it. Tool limitation, not evidence of absence. |
| `apploi.pipeline_stage` | Board-level stage — a coarse bucket, NOT the same concept as `application_status` below | `recruiting.pipeline_stage` | **Blocked — needs vendor understanding, not more DOM work** | Real board-level stage vocabulary is now confirmed (New / In Review / Interview / Offer / Hired / Unqualified) via the `role="combobox"` column headers. Deliberately kept as its own observation key, never merged with `application_status`. |
| `apploi.application_status` *(new, split from pipeline_stage per the review decision)* | Candidate/application-level status — Rule E input, once populated | `recruiting.application_status` | **Blocked** | The earlier manually-reported "Requested Interview" does not exactly match any of the six board-level stage labels. It is treated as a distinct concept — possibly a sub-status within the "Interview" column, possibly independent vendor language — until the product relationship is confirmed. **Not observed via DOM this session at all** (no data-testid/aria/heading anchor found for it — likely a plain-text field, a target for the enhanced plain-text pass). |
| `apploi.candidate_rating` *(new, split from good_match_indicator)* | Rule B input — normalizes to `{score, scale}` | `recruiting.candidate_rating` | **Partially extractable** | A real `aria-label="5 out of 5 stars"` widget is confirmed. This key captures only the numeric rating itself — nothing about what it means. |
| `apploi.match_indicator` *(new, split from good_match_indicator)* | Rule B input — a bounded vendor label, e.g. "Good Match" | `recruiting.match_indicator` | **Blocked** | Not confirmed as existing separately from the star rating this session. Do not assume the star rating and a "Good Match" label are the same thing, or that either implies the other. |
| `apploi.timeline.interview_event_present` | Rule A input | `recruiting.timeline_interview_event` | **Partially extractable** | The activity feed's container is confirmed, real, and contains genuine interview-adjacent content ("Email Received: Ok sir thank you," "Email Sent: Yes I …"). Individual entries aren't yet separately anchored — only the whole panel's flattened text was captured. |
| `apploi.interview_scheduling_evidence` | Rule C input | `recruiting.interview_scheduled` | **Blocked** | The "Interview" tab exists and is confirmed; its content wasn't captured this session (only the default "Activity" tab was inspected). |
| `apploi.interview_reschedule_evidence` | Rule C/E input | `recruiting.interview_rescheduled` | **Blocked** | Same as above — plausibly inferable from the Activity feed's email content, but not yet confirmed at the individual-entry level. |
| `apploi.candidate_response_confirming_interview` | Rule C input | `recruiting.candidate_interview_confirmation` | **Blocked** | Same reasoning. |
| `apploi.interview_completed_evidence` | The one field no rule may infer | `recruiting.interview_completed_evidence` | **Blocked — may require vendor understanding, not DOM work** | Not observed anywhere in this session. It's a real open question whether Apploi exposes a direct completion signal at all. |
| `apploi.latest_activity_at` | Staleness reasoning | `recruiting.latest_activity_at` | **Approved in principle, not yet implemented** | `data-testid="last-contacted"` + sibling `message-sent-icon`/`message-received-icon` is real, stable, and confirmed at the candidate-row level — one of the strongest findings from the first reconnaissance session. Not implemented in `apploiCandidateDialogCollector.ts` this phase: the collector operates dialog-scoped, and no safe, unambiguous way to associate the correct list row with the confirmed candidate was available without inventing a speculative row-container selector. Needs a targeted reconnaissance pass on the list-page row structure before implementation. |
| `apploi.document_availability` | Future requirement gating | `recruiting.document_availability` | **Blocked** | The "Documents" tab exists; content not captured. |
| `apploi.assessment_indicator` | Additional assessment signal beyond rating/match_indicator | `recruiting.assessment_indicator` | **Blocked — same open question as candidate_rating/match_indicator** | Possibly the same 5-star widget, possibly distinct. Unconfirmed. |
| `apploi.communication.interview_related_present` | Rule A/D input — sensitive, minimized | `recruiting.communication_interview_related` | **Partially extractable** | Same status as the timeline observation above — container confirmed, per-entry extraction not yet possible. |
| `viventium.employee_record_exists` | Rule F input | `recruiting.viventium_record_exists` | **Not in scope for this session** | This reconnaissance was Apploi-only, per the tasking. Unchanged. |

## Explicit Non-Conflation Rules (per the follow-up review decision)

- **`pipeline_stage` and `application_status` are separate observations and must never be merged, aliased, or have one overwrite the other.** `pipeline_stage = Interview` and `application_status = Requested Interview` co-existing is expected — likely a normal parent-stage/sub-status relationship — and must never, by itself, produce a stage-inconsistency inference. A stage inconsistency may only be produced when a versioned rule finds evidence that is *genuinely* incompatible or stale (e.g., later-stage activity contradicting an earlier status) — not from mere co-occurrence of these two fields.
- **`candidate_rating` and `match_indicator` are separate observations.** A star rating is not proof of a "Good Match" label, and neither implies an interview was completed. If only the star rating is ever observed, downstream reasoning must say "positive rating evidence present" — never "Good Match observed."

## Vendor Identity (Apploi)

The confirmed candidate tab's URL carries two GraphQL global IDs as query
parameters: `candidateID` (one candidate) and `applicationID` (one
application — a candidate may eventually have more than one). `candidateID`
is the primary `vendor_record_id` stored in `recruiting_lead_vendor_identities`;
`applicationID` is parsed but never folded into it. Both are parsed fresh
from the confirmed tab's URL on every run (`parseApploiCandidateUrl` in
`vendorIdentity.ts`) — never hardcoded for a specific person. The first link
between a Serve recruiting lead and an observed `candidateID` requires
explicit human confirmation (`match_method: 'vendor_id'`,
`match_confidence: 'high'`, `is_human_confirmed` only ever set by
`confirmVendorIdentity`, never automatically). Every later run must find the
stored `candidateID` matching the freshly observed one — a mismatch is a
hard stop, never a silent overwrite (`decideVendorIdentityAction` in the same
file).

## New, Currently Unmodeled Evidence Found This Session

Real, confirmed, but not yet tied to any observation key or rule — a product decision, not a DOM one, per the catalog's own "no operational decision, no observation" rule:

- **Recent work experience** (`data-testid="work-experience"`) and **education** (`data-testid="education-experience"`) — real structured resume content, confirmed present.
- **Tags** (`data-testid="tag"`, e.g. "test", "No Cats") — real candidate tags, purpose/operational relevance unclear.
- **Screen tab pre-screening Q&A** — a real, confirmed set of question/answer pairs ("Are you at least 18 years old?" / "YES", etc.) inside the Screen tab's `[role="tabpanel"]`. No operational decision has been stated for these yet.
- **A `role="combobox"` reading "Stage One" inside the Screen tab's panel.** Confirmed real, but this is a **different concept from the board-level `pipeline_stage` combobox** ("New"/"In Review"/"Interview"/"Offer"/"Hired"/"Unqualified") documented above — it appears to be internal to the Screen tab's own question flow, not a pipeline stage. Flagged explicitly so it is never conflated with `apploi.pipeline_stage`.

Neither is added to the catalog above until there's a stated operational decision they'd influence — adding them now would violate the catalog's own admission rule.

## Explicitly Excluded, Unchanged

SSN, birth date, or equivalent high-sensitivity identifiers — still never read, still not defined as an observation key. Full message thread content, sender/recipient personal contact details beyond a labeled role, cosmetic navigation chrome — still excluded, confirmed by this session to include the page's own toolbar, notifications, user-avatar ("Hud Keel" — Hud's own logged-in identity, not candidate data), and pagination controls.
