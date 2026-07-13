# Serve Design System 2.0

Status: foundation established and applied to the six priority Serve OS surfaces (Global Shell, Workspace, Dashboard, Resident Directory, Resident Detail, Resident Wellness). Not yet applied to Prospects, Recruiting, Community Intelligence, Ask Serve, or the public website — see "Migration guidance" below.

**Selected direction (current):** Blue & White (Clean & Clinical). The top header uses the same deep Serve navy as the sidebar — not a brighter royal blue — so the two read as one continuous frame. Canvas and cards are cool white/near-white (no cream, no warm ivory); card borders are a subtle cool-blue tint; gold is reserved strictly for selection and premium emphasis. This superseded an earlier warm-ivory iteration of the same token system — see "What changed, architecturally" below for how that recolor was done without touching component structure.

## Design philosophy

**The interface should reduce cognitive load, not simply display information. Every screen should answer the user's next operational question before they have to ask it.**

**No critical state, action, warning, count, filter, or deadline may be communicated only through small text, faint contrast, or color alone.**

Every screen should answer three questions before the user has to ask:
1. What do I need to know?
2. What needs my attention?
3. What should I do next?

The platform should feel calm, premium, operational, trustworthy, human, and clinically confident without feeling institutional. White space is preferred over shrinking content — if a layout feels dense, add room before you shrink type. Important information must be understandable at normal desktop viewing distance without zooming or squinting, because the people using this daily include older adults' adult children and operational staff working through it for hours at a stretch.

## What changed, architecturally

Serve OS already used a small, consistent set of semantic Tailwind classes everywhere — `bg-surface`, `bg-ivory`, `text-body`, `text-muted`, `text-subtle`, `border-ivory-border`, `bg-gold-subtle`, `bg-navy` — rather than scattered hex values. That meant the highest-leverage, lowest-risk move was **redefining what those tokens equal**, in one place (`app/globals.css`), rather than rewriting every page. This has now happened twice:
1. An initial recolor from the original (unintentionally) dark blue-gray canvas (`--color-ivory: #616D81`, `--color-surface: #6F7B90` with near-white text) to a warm-ivory light theme.
2. A follow-up, purely-color-token recolor from warm ivory to the selected Blue & White direction — canvas/section/border tones shifted from warm (cream-tinted) to cool (blue-gray-tinted), with no component, layout, or class-name changes. `bg-ivory`/`border-ivory-border`/etc. kept their names throughout both passes even though the hex values they resolve to no longer look "ivory" in the literal sense — renaming them would have meant touching every file that uses them for no visual benefit.

Both passes cascade to every page in the app automatically, including pages not explicitly migrated in this pass.

Design System 2.0 is intentionally still Tailwind v4's own `@theme` mechanism — no second styling framework, no CSS-in-JS, no component library dependency was introduced.

## Color tokens

### Brand
| Token | Value | Use |
|---|---|---|
| `navy` | `#2F3F57` | Sidebar, top nav (identical value — one continuous frame), primary buttons |
| `navy-deep` | `#142030` | Rarely used, deepest brand navy |
| `navy-light` | `#253648` | Hover state for navy text/buttons |
| `blue` | `#3D6690` | Reserved for informational-highlight panels (Filter Banner) — **not** general link/action color; ordinary links use `navy` |
| `blue-light` | `#6D93B8` | Lighter blue accent |
| `blue-pale` | `#EAF1FA` | Pale blue inset section (Filter Banner background) |
| `blue-border` | `#CBDCED` | Border for blue-pale sections |
| `gold` | `#C9A96E` | Reserved — selection, premium emphasis, active nav detail. **Not** generic decoration |
| `gold-light` | `#D6BA85` | Lighter gold, on-navy contexts |
| `gold-dark` | `#A88240` | Gold text on light backgrounds (better contrast than `gold` itself on white) |
| `gold-subtle` | `#F7F1E8` | Pale gold badge background — intentionally the one remaining warm tone, used only for the gold accent role |

### Surfaces
| Token | Value | Use |
|---|---|---|
| `canvas` | `#FAFBFC` | App background (`body`, `PageContainer`) — cool near-white, no cream |
| `surface` | `#FFFFFF` | Elevated card |
| `ivory` | `#F3F6F9` | Subtle cool-gray inset section (inside a card) — name kept for compatibility, no longer a warm tone |
| `ivory-warm` | `#E9EEF4` | A touch deeper — chips/badges sitting inside an inset section |
| `ivory-border` | `#DCE6F2` | Standard hairline border everywhere — the requested subtle cool-blue card border |
| `hover-surface` | `#EEF2F6` | Generic hover background |
| `disabled-surface` | `#F0F2F4` | Disabled control background |
| `warning-surface` | `#FDF3E7` | Pale amber — monitor/important state (unchanged; semantic state colors were not part of the neutral-palette recolor) |
| `overdue-surface` | `#FBECEA` | Pale red — overdue/urgent state (unchanged) |
| `success-surface` | `#EAF6EF` | Pale green — completed/success state (unchanged) |

### Text
| Token | Value | Use |
|---|---|---|
| `body` | `#1E2328` | Primary text — dark charcoal, neutral (not navy-tinted) |
| `muted` | `#545F6B` | Secondary text — medium gray |
| `subtle` | `#7C8794` | Tertiary/label text — light gray, still meets normal reading contrast at 13px+; never used for content that must read as important |
| `warning-text` | `#92400E` | Paired with `warning-surface` |
| `danger-text` | `#B42318` | Paired with `overdue-surface` |
| `success-text` | `#0F7A47` | Paired with `success-surface` |

Sidebar/top-nav text uses `text-white/NN` opacity utilities directly (e.g. `text-white/70`, `text-white/95`) rather than a separate "inverse" token — this was already the existing convention and works correctly against the retained navy.

### Operational state convention
Every operational state pairs a **surface**, a **text color**, and either an icon or a text label — never color alone:
- **Overdue** → `overdue-surface` + `danger-text` + the literal word "Overdue" as a badge
- **Warning / Monitor / Important** → `warning-surface` + `warning-text`
- **Success / Completed** → `success-surface` + `success-text`
- **Imported (Cinch CCM / AxisCare)** → amber badge reading "Imported — {system}", never just a color shift from a Serve OS entry
- **Selected** (nav, tabs) → border/background change **and** bold/semibold text weight, never a color-only tell
- **Disabled** → reduced opacity **and** a visible "Coming Soon" badge or `aria-disabled`, never opacity alone

## Typography scale

Named font-size tokens are real Tailwind utilities (Tailwind v4 auto-generates `text-{name}` from `--text-{name}` theme entries):

| Utility | Size | Line-height | Use |
|---|---|---|---|
| `text-label` | 13px | 19.2px | Field labels, badges' text baseline, section eyebrows |
| `text-sm` (Tailwind default) | 14px | — | Secondary text, dates, helper text |
| `text-base` (Tailwind default) | 16px | — | Body text, form control values, primary card content |
| `text-button` | 15px | 20px | Button and nav-item label text |
| `text-badge` | 13px | 17.6px | Badge text (via the shared `Badge` component) |
| `text-card-title` | 18px | 24px | Card/row titles (e.g. resident name in a row) |
| `text-section-title` | 24px | 30.4px | Section headings ("Today's Work", "Quick Actions") |
| `text-page-title` | 36px | 41.6px | Page `<h1>` |
| `text-metric` | 44px | 1 | Primary dashboard metrics |

**Rule**: nothing that carries real operational meaning — a due date, a filter description, a count, a source label, an entered-by attribution — may render below `text-sm` (14px). Purely decorative uppercase eyebrows may use `text-label` (13px) but never smaller, and never as the sole carrier of state.

### Acceptable vs. unacceptable

✅ **Acceptable**: `<p className="font-sans text-sm text-muted">Due Jul 15 · Important priority</p>` — 14px, legible secondary text.
❌ **Unacceptable** (previous pattern): `<p className="font-sans text-[10px] text-muted">Showing only residents due or overdue today.</p>` — a filter's entire meaning compressed into 10px gray text with no visible way to clear it.

✅ **Acceptable**: an overdue follow-up shows a red "Overdue" badge, red-tinted card border, **and** the word "Overdue" in the badge text.
❌ **Unacceptable**: an overdue follow-up only shown via a slightly different shade of the card background.

## Spacing

No new spacing tokens were introduced — Tailwind's default spacing scale (0.25rem increments) is sufficient and already used consistently. The applied rhythm:
- Page padding: unchanged (`PageContainer`'s `px-10 py-10`)
- Card padding: `p-6` for standalone cards, `px-4 py-3` to `px-4 py-3.5` for list-row-style cards
- List rows: `px-6 py-6` (bumped from `py-5`) for resident rows — more breathing room per row
- Button/control minimum height: **44px** (`h-11`) wherever the control is a discrete click/tap target (nav items, tabs, primary/secondary buttons, Complete/Dismiss actions, search inputs)

## Shared component patterns

Three new components under `components/ui/` centralize what used to be duplicated per-file:

- **`Badge`** (`components/ui/Badge.tsx`) — replaces three near-identical local `Badge` functions (Connections, Wellness Notes, Open Follow-Ups). Tones: `neutral`, `gold`, `blue`, `warning`, `danger`, `success`, `imported`.
- **`EmptyState`** (`components/ui/EmptyState.tsx`) — replaces three near-identical local `EmptyState` functions. Optional `title` + required `description`, always at readable body-text size.
- **`FilterBanner`** (`components/ui/FilterBanner.tsx`) — the Phase 6 pattern below, used by the Resident Directory's Wellness Watch date filter.

Existing shared components (`PageContainer`, `DashboardCard`, `QuickActionCard`, `WorkspaceLaunchCard`) were kept and updated in place rather than replaced — they were already correctly factored, just under-sized/under-contrasted.

**Not centralized in this pass** (left as page-local `Section`/`Field` functions in `app/residents/[id]/page.tsx`): the resident-detail audit/import sections (Resident Source, Imported Contacts, Imported Relationship History). These are lower-traffic, admin-facing sections; centralizing them wasn't necessary to hit this task's readability goals and would have expanded scope without a corresponding user-facing benefit.

## Filter conventions

A filtered view must always show, together, near the page title or tab controls:
1. The word **"Filtered View"** (or equivalent) as a small label
2. The filter's meaning in a full sentence, at `text-base` (16px)
3. The **result count**, bolded, in the same sentence
4. An explicit, button-styled **link back to the unfiltered view**

This is exactly what `FilterBanner` renders. It is never acceptable to represent an active filter with only a URL query parameter and a one-line gray sentence.

## Metric-card conventions

- A metric card's number is the largest thing on the card (`text-metric` or `text-4xl` for a two-up layout).
- A metric's label sits **above** the number in `text-label`, uppercase, `gold-dark` (not `gold` — insufficient contrast on a light card).
- A one-line description sits **below** the number in `text-sm`, explaining what the number means in plain language ("Due or overdue", not just "Overdue").
- If a metric is actionable, it is a real `<Link>` with its own hit area (`min-h-[64px]` in `WellnessFollowUpsCard`) — never the entire card routing to one ambiguous destination when the card contains multiple distinct numbers with different meanings.

## Form conventions

- Labels: `text-label` (13px), `font-semibold`, `uppercase`.
- Control text (input/select/textarea values): `text-base` (16px), not `text-sm`.
- Control padding: minimum `py-2` / `px-3` — enough vertical room that the control doesn't feel cramped against its own text.
- Borders: `border border-ivory-border`, `focus:border-gold/60` — every focus state is a border-color change, and interactive-heavy inputs (page/section search) add a visible `focus:ring-2 focus:ring-gold/20`.
- Primary submit buttons: `h-11` (44px), `text-button` (15px), `font-semibold`, `bg-navy`.
- Errors: rendered as a full-width colored block (`border-red-200 bg-red-50 text-red-600`) at `text-sm`, never a bare inline color change on the label.
- Optional fields are explicitly labeled "(optional)" in the label text itself — never left ambiguous.

## Migration guidance for remaining pages

Because the token layer is global, every page already inherits the new palette automatically. What's still deferred (not restyled with the new typography scale or shared components):
- Prospects (`app/prospects`, `components/prospects/*`)
- Recruiting (`app/recruiting`, `components/recruiting/*`)
- Community Intelligence, Ask Serve
- Public website, family/resident portals (explicitly out of scope for this task)

When migrating one of these:
1. Swap any local `Badge`/`EmptyState` implementation for `components/ui/Badge` and `components/ui/EmptyState`.
2. Replace `text-[10px]`/`text-[11px]`/`text-xs` on anything that isn't purely decorative with `text-label` or `text-sm` respectively.
3. Bump primary buttons to `h-11` and form controls to `text-base`.
4. Do not invent new color tokens for that page — if an existing token doesn't fit, raise it for addition to this document rather than hardcoding a new hex value.
