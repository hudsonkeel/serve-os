# Serve OS

## Start Here

Before designing or building any Serve Intelligence capability (Scheduling
Intelligence, Relationship Intelligence, or any future intelligence
domain), read
[`docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md`](./docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md)
first. It is the governing philosophical and architectural document for
that platform.

Serve OS is the internal operating system for Serve Caregiving — the
operational intelligence and coordination layer above the external
systems that actually execute work (AxisCare, CINCH CCM, Apploi,
Viventium, Google Workspace, Dialpad, and SAS). Serve OS does not intend
to replace these systems; it gives staff one place to understand today's
work, manage residents, and launch the right external system when
execution needs to happen there.

Core product model:

- **Dashboard = Know** — what is happening
- **Workspace = Do** — what should I do next
- **Residents = Manage** — deep, per-resident operational record
- **Ask Serve = Think** — reason across Serve OS data on demand

Full architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md). Current
platform status: [`CURRENT_STATUS.md`](./CURRENT_STATUS.md). Product
philosophy: [`VISION.md`](./VISION.md).

## Technology stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript
- Tailwind CSS v4 (`@theme`-based design tokens — see
  [`docs/design/SERVE_DESIGN_SYSTEM_2.md`](./docs/design/SERVE_DESIGN_SYSTEM_2.md))
- [Supabase](https://supabase.com) — database, authentication, storage
- This Next.js version has meaningful breaking changes from prior
  training data — see [`AGENTS.md`](./AGENTS.md) before making changes.

## Development setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment setup

Copy `.env.example` to `.env.local` and fill in real values — `.env.local`
is gitignored and must never be committed. Never write a real credential
into any tracked file, including documentation.

Full variable-by-variable reference (purpose, exposure, required/optional,
failure behavior): [`ENVIRONMENT.md`](./ENVIRONMENT.md).

## Key modules

| Module | Route | Mode |
|---|---|---|
| Dashboard | `/` | Know |
| Workspace | `/workspace` | Do |
| Residents | `/residents` | Manage |
| Prospects | `/prospects` | — |
| Recruiting | `/recruiting` | — |
| Community Intelligence | `/community-intelligence` | Think proactively |
| Ask Serve | `/ask-serve` | Think on demand |
| Settings | `/settings` | Configure/govern/secure/connect |

Workspace's **Today's Schedule** shows live, read-only AxisCare visit
data, gated behind a server-only feature flag
(`AXISCARE_SCHEDULE_ENABLED`) that defaults to disabled — see
[`docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`](./docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md).

## Read-only integration philosophy

Every external vendor integration in this repository starts read-only,
and stays read-only until a specific, repeated operational need proves
that read-plus-deep-link resolution back into the vendor's own UI is
insufficient. AxisCare is the first example: `lib/integrations/axiscare/`
is GET-only by construction (`axisCareGet()` hardcodes the HTTP method,
no override exists), server-only, and normalizes into a vendor-neutral
domain (`lib/scheduling/`) before anything else in the app touches it.
Vendor systems remain systems of record; Serve OS does not silently
mutate vendor data. Full policy:
[`docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md`](./docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md).

## Testing

No jest/vitest/mocha in this repository. `lib/integrations/axiscare/`
and `lib/scheduling/` use small, dependency-free `node:assert`-based test
scripts, runnable directly via Node's native TypeScript support:

```bash
npm run test:axiscare
npm run test:scheduling
```

## Deployment

A deploy pipeline auto-builds on push to GitHub. **The exact platform is
currently unreconciled** — `netlify.toml` documents Netlify, but recent
live evidence shows Vercel is what actually deploys this repository. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for the open discrepancy. Do not
assume either platform's dashboard is authoritative until this is
resolved.

## Documentation

| Document | Purpose |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Technical architecture, module boundaries, data flow |
| [`CURRENT_STATUS.md`](./CURRENT_STATUS.md) | What's live, flagged, foundation-only, planned, or blocked |
| [`CHANGELOG.md`](./CHANGELOG.md) | Dated record of changes |
| [`DECISION_LOG.md`](./DECISION_LOG.md) | Append-only architectural/product decisions with rationale |
| [`ENVIRONMENT.md`](./ENVIRONMENT.md) | Every environment variable, what it does, and failure behavior |
| [`MILESTONES.md`](./MILESTONES.md) | Phase 1 / Phase 2 milestone tracking |
| [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) | Honest per-dimension readiness assessment |
| [`SERVE_BUILD_CONTEXT.md`](./SERVE_BUILD_CONTEXT.md) | Full context for restarting a development session |
| [`VISION.md`](./VISION.md) | Long-term product vision |
| [`docs/architecture/`](./docs/architecture/) | Operating model, navigation model, Settings architecture, scheduling intelligence |
| [`docs/integrations/`](./docs/integrations/) | Per-vendor integration policy |
| [`docs/design/`](./docs/design/) | Design System 2.0 |
| [`docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md`](./docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md) | Governing document for the Serve Intelligence Platform |
