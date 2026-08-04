import type { Locator } from "playwright";

// Narrow, read-only tab navigation — the ONE and ONLY click-capable
// function anywhere in the collector/extractor codebase. See
// docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md and the
// approval that added this: a tab switch changes what is displayed, not
// any vendor-side state, so it is not treated the same as a mutation.
//
// This is NOT general Playwright clicking. Every one of these conditions
// must hold before a click happens:
//   - the element is inside the confirmed active candidate dialog (the
//     caller supplies dialogScope, already verified — see cdpAttach.ts);
//   - role="tab" (queried via getByRole, never a generic selector);
//   - its visible label is in APPROVED_TABS (checked before any DOM query,
//     not just relied upon via TypeScript's type system — see the runtime
//     check below, which holds even if this is ever called with a
//     non-literal string);
//   - it does not submit a form, invoke a vendor mutation, or touch any
//     other control — structurally impossible, since getByRole("tab", ...)
//     cannot match a button, combobox, or menu item regardless of name.
// The selection is verified afterward (aria-selected + label match) —
// never assumed to have succeeded just because .click() didn't throw.
export const APPROVED_TABS = ["Activity", "Screen", "Interview", "Documents", "Integrations"] as const;
export type ApprovedTab = (typeof APPROVED_TABS)[number];

export interface TabSelectionResult {
  readonly selected: boolean;
  readonly verifiedLabel: string | null;
  readonly reason: "selected" | "not_in_allowlist" | "not_found" | "ambiguous" | "verification_failed";
}

export async function selectApprovedTab(dialogScope: Locator, tab: string): Promise<TabSelectionResult> {
  // Runtime check, not just a TypeScript type — this must hold even if a
  // future caller passes a non-literal string.
  if (!(APPROVED_TABS as readonly string[]).includes(tab)) {
    return { selected: false, verifiedLabel: null, reason: "not_in_allowlist" };
  }

  const tabButton = dialogScope.getByRole("tab", { name: tab, exact: true });

  let count: number;
  try {
    count = await tabButton.count();
  } catch {
    return { selected: false, verifiedLabel: null, reason: "not_found" };
  }

  if (count === 0) return { selected: false, verifiedLabel: null, reason: "not_found" };
  if (count > 1) return { selected: false, verifiedLabel: null, reason: "ambiguous" };

  await tabButton.click();

  // Verify the selection took effect — never assume a click "worked" just
  // because it didn't throw.
  const [ariaSelected, verifiedLabel] = await Promise.all([
    tabButton.getAttribute("aria-selected").catch(() => null),
    tabButton.textContent().catch(() => null),
  ]);

  const labelMatches = verifiedLabel?.trim() === tab;
  const isSelected = ariaSelected === "true";

  if (!isSelected || !labelMatches) {
    return { selected: false, verifiedLabel: verifiedLabel ?? null, reason: "verification_failed" };
  }

  return { selected: true, verifiedLabel, reason: "selected" };
}

// "Prefer direct DOM inspection of already-rendered content when
// possible. Use tab selection only when content is not otherwise
// present." — checks whether the target tab's panel already has content
// visible (some UI frameworks keep all tab panels mounted, just hidden)
// before ever clicking. Read-only — only queries, never clicks.
export async function tabContentAlreadyVisible(dialogScope: Locator, tab: string): Promise<boolean> {
  if (!(APPROVED_TABS as readonly string[]).includes(tab)) return false;

  try {
    const tabButton = dialogScope.getByRole("tab", { name: tab, exact: true });
    const isSelected = await tabButton.getAttribute("aria-selected").catch(() => null);
    if (isSelected === "true") return true;

    // A tabpanel is often linked via aria-controls; check if a visible,
    // non-empty panel already exists regardless of the tab's own selected
    // state (defensive — some implementations keep panels mounted).
    const controlledId = await tabButton.getAttribute("aria-controls").catch(() => null);
    if (!controlledId) return false;
    const panel = dialogScope.page().locator(`#${controlledId}`);
    return (await panel.isVisible().catch(() => false)) && (await panel.textContent().catch(() => ""))!.trim().length > 0;
  } catch {
    return false;
  }
}
