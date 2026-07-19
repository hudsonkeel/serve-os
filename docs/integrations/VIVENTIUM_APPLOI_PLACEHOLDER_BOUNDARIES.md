# Viventium / Apploi / Screening Provider — Placeholder Adapter Boundaries

Governance Knowledge Engine Phase 1. Read this before extending, calling, or reasoning about
`lib/intelligence/domains/compliance/backgroundEligibility/sourceAdapters/`.

## The one thing this document exists to say plainly

**We have not confirmed that Viventium, Apploi, or the background-screening provider Serve
uses exposes what Background Eligibility needs through any accessible API.** No vendor
conversation has happened. Nothing in `sourceAdapters/` is a live connector, a connector
waiting to be turned on, or evidence that live integration is imminent. Every capability every
adapter declares is `"unverified"` — not because we're being cautious, but because it is
literally true: nobody has checked.

Do not read the existence of `viventium.ts`, `apploi.ts`, or `screeningProvider.ts` as a
commitment. They exist to establish source-system *identity* and a typed *boundary* — where a
future integration would plug in — not to imply the integration itself is close.

## What each adapter actually does today

| Adapter | File | What it does |
|---|---|---|
| Viventium | `sourceAdapters/viventium.ts` | Declares 10 capability areas, all `unverified`. Exposes one fixture lookup function returning fictional employee-identity data, used only by the seed script. |
| Apploi | `sourceAdapters/apploi.ts` | Same shape — 10 capability areas, all `unverified`. Fixture-only applicant-identity lookup. |
| Screening provider | `sourceAdapters/screeningProvider.ts` | Same shape, with one capability (`onboarding_task_completion`) marked `unavailable` (not this vendor's concern — that's Viventium/Apploi's). Fixture-only report lookup, returning fictional raw offense text. |

None of the three makes a network call. None returns anything but a hardcoded fixture, keyed by
one of five fixture ids (`fixture-a` through `fixture-e`), used exclusively by
`scripts/seed-governance-demo-data.ts`.

## The source-capability contract

`sourceAdapters/../sourceCapability.ts` defines two small types every adapter and every
persisted piece of evidence uses:

- **`SourceCapabilityStatus`** — `"confirmed" | "unverified" | "unavailable" | "manual" |
  "file_import"`. What a vendor has actually been confirmed to expose, versus what Serve
  currently satisfies through a human step instead.
- **`EvidenceRetrievalMetadata`** — carried inside every `HistoricalFact.payload` this decision
  type records: external subject id, onboarding/screening status, evidence type/availability,
  a `verifiedAt` freshness timestamp, an optional source-system link, `retrievalMethod`
  (`"live_api" | "file_import" | "manual_verification" | "fixture_demonstration"`),
  `isAuthoritative`, and `requiresManualConfirmation`.

Phase 1 never produces `retrievalMethod: "live_api"`. The Governance Workspace's decision detail
view always shows retrieval method and freshness per evidence item — see
`app/governance/[id]/page.tsx` — specifically so nothing implies continuous or live monitoring
where none exists.

## The usable workflow today

```
Authoritative system or screening provider
        ↓
Human review or approved import
        ↓
Structured evidence recorded in Serve   (HistoricalFact.payload — normalized fields
                                          only, never a full sensitive background report)
        ↓
Decision evaluation                     (classificationEngine.ts)
        ↓
Explainable outcome and recommendation
```

Every Phase 1 case — the 5 fictional demonstration cases and any real future case — enters
Serve through the "human review or approved import" step. No background report, sensitive or
otherwise, is ever stored in full; only the normalized fields the classifier actually evaluates.

## Phase 2 integration-discovery requirement

Before any adapter's capability status can move from `"unverified"` to `"confirmed"` or
`"unavailable"`, confirm with each vendor:

- Applicant and employee identifiers — stable, queryable?
- Onboarding-task completion — queryable per applicant/employee?
- Background-screening order and completion status — queryable, and from which system
  (Viventium, Apploi, or the screening provider directly)?
- Adjudication or finding status — the actual content this module needs. Queryable, or only
  ever available as a document/report a human reads?
- Document and certificate metadata — queryable?
- Report links or external record identifiers — available, and stable?
- Configurable exports — available, and in what format/cadence?
- API endpoints — do they exist, are they documented, is access already provisioned?
- Webhooks or change notifications — available, or is polling the only option?
- Access and licensing requirements — who owns the relationship, what does access cost, does
  Serve's current contract already cover API access or does it require a change?

This list, not assumptions from this codebase, should drive whatever Phase 2 actually builds.
Until it's answered, `sourceAdapters/` stays exactly what it is today: an identity boundary and
a fixture, not a connector.
