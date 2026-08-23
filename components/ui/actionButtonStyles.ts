// Shared class strings for the resident-profile action hierarchy:
//   Primary workflow action -> filled Serve navy button
//   Create/Edit action      -> obvious secondary/outlined button
//   Navigate/View detail    -> plain text link (unchanged, not covered here)
// Centralized here (rather than a new colored component) so every caller
// draws from the same navy/ivory-border tokens already used throughout the
// app instead of each defining a near-duplicate class string locally.

export const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-navy px-4 font-sans text-button font-medium text-white shadow-card transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50";

// Full-size secondary — for top-level action-strip buttons.
export const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-navy/20 bg-surface px-4 font-sans text-button font-medium text-navy shadow-card transition-colors hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-50";

// Compact secondary — for inline create/edit controls sitting inside a
// section header (e.g. "Edit Current Needs", "+ Add Working Note").
export const SECONDARY_BUTTON_SMALL_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-navy/20 bg-surface px-3 py-1.5 font-sans text-sm font-medium text-navy shadow-card transition-colors hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-50";

// No width/horizontal-padding baked in (unlike the other constants above)
// — the trigger is deliberately meant to sit narrower than its sibling
// actions, so width is a per-caller concern.
export const MENU_TRIGGER_CLASS =
  "flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-ivory-border bg-surface font-sans text-button font-medium text-muted shadow-card transition-colors hover:border-navy/20 hover:text-body";

export const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 px-4 py-2.5 text-left font-sans text-sm text-body transition-colors hover:bg-ivory";
