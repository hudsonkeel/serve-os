# Website Intake Backfill Review

One-time audit produced during the Serve Intake Intelligence Engine
scope (see `docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md`). Records
the exact state of `website_intake_submissions` at the time the engine
was built, and what — if anything — should happen to those rows.

## Summary

| Metric | Count |
|---|---|
| Total submissions | 5 |
| By intake type: `family_care_inquiry` | 3 |
| By intake type: `professional_referral` | 1 |
| By intake type: `employment_interest` | 1 |
| By schema shape | 1 (all 5 rows share the same `submit-intake.js` `normalizePayload()` shape) |
| Automatically processable (would classify above `needs_review`) | 0 |
| Requiring review | 5 |
| Unsupported schema | 0 |
| Likely duplicate | 0 |

## Why zero rows are real, and why zero are auto-processable

Every one of the 5 existing rows is synthetic smoke-test data, not a
real customer inquiry:

- All 5 `name` values are literally `"TEST Serve Caregiving"`, `"TEST
  Serve Caregiving Test"`, `"Test Professional"`, `"Test MD"`, or `"Test
  Care Needed"`.
- All 5 `form_payload.submitted_page` values point at a Netlify
  **deploy-preview** URL (`deploy-preview-3--cerulean-biscuit-2ed133.netlify.app`),
  not `servecaregiving.com` — confirming they came from manually
  smoke-testing the still-unmerged `feature/intake-optimization` branch's
  pull-request preview deploy, not real website traffic (see
  `docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md`, "Current
  architecture findings," for the full git-history-verified explanation
  of why nothing is live in production yet).
- All 3 `family_care_inquiry` rows would classify as `needs_review` under
  this engine's real rules regardless of their synthetic content, because
  the live `family-consultation` form itself doesn't collect a
  structured prospective-client name or a full street address (only a
  ZIP) — see the field-mapping inventory in the design doc. This isn't a
  backfill-specific finding; it's the same limitation every future real
  submission from the current form will also hit until the form
  collects more.
- The `professional_referral` row (`"Test Professional"`, organization
  `"Test SNF"`) would classify as `professional_relationship` — this
  service actually **is** identity-complete — but was left unprocessed
  for this backfill pass since it's synthetic test content, not a real
  referral.
- The `employment_interest` row (`"Test MD"`) would route to `recruiting`.

## Recommended approach

**Do not process any of these 5 rows into real operational records.**
They are synthetic test artifacts, not real inquiries — creating a real
`referral_source` Relationship or `recruiting_leads` row from
`"Test Professional"` / `"Test SNF"` / `"Test MD"` content would pollute
production data for no benefit. No current-due Action Board items should
be generated from them.

**Once `feature/intake-optimization` (or an equivalent) actually merges
and starts receiving real production traffic**, no backfill action is
needed at all — every new row will be picked up automatically the next
time someone visits the Intake Queue's New tab or clicks "Process New
Submissions," since `getUnprocessedWebsiteIntakeSubmissions()` already
finds every submission with no settled processing record, regardless of
when it was created.

## What happens to these 5 rows now

Nothing automatic. They remain in `website_intake_submissions`,
unprocessed (no `intake_processing_records` row), until an engineer or
Brian explicitly decides to either process them (they'll route to Needs
Review, exactly as documented above) or leaves them as historical
artifacts of the branch's own smoke testing. This scope does not delete,
modify, or otherwise touch them — consistent with the immutable-provenance
principle applying even to test rows created outside this engine's own
verification runs.
