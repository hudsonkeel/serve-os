# Apploi DOM Map — Alma Dhora Owolabi (Reference Case)

**Document Type:** DOM Map (Phase 1 of [`APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md`](./APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md))
**Status:** Populated from a real reconnaissance session — see confidence/caveat notes below
**Last Updated:** 2026-07-21

## A Real Limitation, Stated Up Front

The reconnaissance tool's structural dump is a **flat list** — three separate `querySelectorAll` passes (data-attributes, then ARIA, then headings), each in document order, with no parent/child nesting recorded. That means "is this element actually inside the candidate dialog?" is an **inference from ordering and context, not a verified fact** for every row below. Where I'm confident based on strong contextual evidence (e.g., appearing directly alongside `role="dialog"`'s own entry, or being a named tab inside it), I say so. Where I'm not certain, I say that too.

**Status update (second session):** the dialog-scoped, tab-iterating reconnaissance tool was run for real against Alma's live record, confirming several rows below at real, dialog-scoped structural paths across two different tab views (removing the ambiguity noted above for those specific rows). Four observations were then promoted to a real, persisting collector — `scripts/collectors/apploiCandidateDialogCollector.ts` — see [`APPLOI_OBSERVATION_CATALOG.md`](./APPLOI_OBSERVATION_CATALOG.md) for exact status per observation. The reconnaissance output that session covered only the Screen and Integrations tabs in full; Activity, Interview, and Documents tab captures are still pending a future reconnaissance pass.

**Also per the follow-up review:** `apploi.pipeline_stage` and `apploi.application_status` are tracked as separate rows below, never merged. Likewise `apploi.candidate_rating` (the star widget) and `apploi.match_indicator` (a possible "Good Match" label) are separate rows — see [`APPLOI_OBSERVATION_CATALOG.md`](./APPLOI_OBSERVATION_CATALOG.md)'s "Explicit Non-Conflation Rules."

## Confirmed Anchors (real, from this session)

| Anchor | Kind | Confidence it's real | Confidence it's dialog-scoped | Notes |
|---|---|---|---|---|
| `[role="dialog"]` | ARIA | High | N/A — this IS the scope root | Preview confirms it's Alma's record: "Alma Dhora Owolabi 2425 Hampton Drive, Little Elm, TX 75068 (972) 330-1505 almaola…" |
| `h2` "Alma Dhora Owolabi" | Heading | High | High (appears immediately after the dialog's own tablist/tabpanel entries in document order) | Candidate name — the identity-verification anchor Phase 3/4 requires before any extraction proceeds |
| `role="tablist"` → tabs "Activity", "Screen", "Interview", "Documents", "Integrations" | ARIA | High | High | Confirms the exact 5-tab structure anticipated in the plan's "recommended next reconnaissance targets" |
| `role="tabpanel"` (Activity content) | ARIA | High | High | Preview: "View allAdd NoteEmail Received: Ok sir thank youJul 12, 6:38pmEmail Sent: Yes I …" — confirms a real activity/communications feed exists |
| `[aria-label*="out of 5 stars"]` | ARIA | High (real element, "5 out of 5 stars" observed) | Medium — plausibly dialog-scoped but not confirmed | Candidate anchor for `apploi.candidate_rating` only. **Whether a separate `apploi.match_indicator` ("Good Match") exists, and whether it relates to this rating at all, is a separate, unconfirmed question — do not treat them as the same observation.** |
| `data-testid="work-experience"` | data-attribute | High | Medium-high (appears late in the data-attribute pass, near other likely-dialog content) | Real content observed: "Sep 2025 - Present Caregiver Landing at Watermere" |
| `data-testid="education-experience"` | data-attribute | High | Medium-high | Real content observed: "Jun 2001 - Mar 2005 Bachelor of Elementary Education Saint Peter's College of Ormo…" |
| `h4` "Resume", `h3` "Recent Experience", `h3` "Education" | Heading | High | Medium-high | Section headings, consistent with the work-experience/education-experience anchors above |
| `h3` "Independent Living Community Caregiver" | Heading | High (real, position title) | **Resolved — high, dialog-scoped** | The dialog-scoped rerun confirmed exactly 3 `h3` elements inside the dialog: this one plus "Recent Experience" and "Education." Excluding those two known labels leaves exactly one, at a stable path across two different tab-view captures. Implemented as `apploi.position` (production-ready). |
| `data-testid="last-contacted"` (button) + `data-testid="message-sent-icon"` / `"message-received-icon"` (sibling svg) | data-attribute | High | **Row-level, not dialog-level** — this is the candidate-list card's "last contacted" field, one per candidate row | This is a genuinely strong Level A (row-scan) anchor — see report item A |

## Ambiguous / Not Yet Confirmed

| Field | What was observed | Why it's not production-ready |
|---|---|---|
| `apploi.pipeline_stage` (board-level) | Column vocabulary confirmed: `role="combobox"` buttons "New", "In Review", "Interview 29", "Offer", "Hired 3", "Unqualified" | This is the pipeline's board-level stage taxonomy — a separate observation from `apploi.application_status` below, never merged with it. |
| `apploi.application_status` (candidate-level) | The earlier manually-reported "Requested Interview" was not observed via any data-testid/ARIA/heading anchor this session | Likely a plain-text field — a direct target for the enhanced plain-text pass on the dialog-scoped rerun. **Do not assume it's an alias for, or a component of, `pipeline_stage` until confirmed.** |
| `apploi.applied_date` | Not observed at all in this pass | The reconnaissance tool only scans `data-testid`/`data-test`/`data-qa`, `role`/`aria-label`, and headings. A plain-text field like "Applied Jul 4" with none of those markers is invisible to it. **Tool limitation, not a DOM absence** — see report item B. |
| `apploi.interview_scheduling_evidence`, `apploi.interview_reschedule_evidence`, `apploi.candidate_response_confirming_interview` | The "Interview" tab exists; its content was not captured (only the default/active "Activity" tab's panel was) | Needs the Interview tab's content inspected — which raises a real design question about whether the collector may click a tab to view it (see report, "one open question") |
| `apploi.document_availability` | The "Documents" tab exists; content not captured | Same as above |
| `apploi.interview_completed_evidence` | Not observed anywhere | May not exist as a direct signal in Apploi's UI at all — this is the one field the whole rule design (Rule D) was built assuming might never be directly observable, and this session hasn't disproven that |
| Individual timeline/communication entries | The activity feed's *container* is confirmed; individual entries ("Email Received: ...", "Email Sent: ...") were only seen as one flattened text blob, not as separately anchored elements | Needs a bounded per-entry selector, not yet found |
| Tags (`data-testid="tag"`, previews "test", "No Cats") | Real, confirmed elements | Not currently mapped to any catalog observation — flagged as available-but-unmodeled evidence, a product question not a DOM one |

## Not Relevant to This Catalog (confirmed, but out of scope)

`archive-button`, `change-view-menu-trigger`, `pagination`, `button-edit-job`, `more-icon`, the page's own `role="toolbar"`/notifications/user-avatar elements, "Previous/Next Page", "Previous/Next Candidate", the dialog's "close" button — all real, all page-chrome or navigation, none feed any observation in the catalog.
