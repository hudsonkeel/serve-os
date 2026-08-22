"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { setCurrentCommunityAction } from "@/lib/actions/currentCommunity";
import { ALL_COMMUNITIES_SELECTION } from "@/lib/auth/communityScope";
import { CARE_MODEL_LABELS, groupCommunitiesByCareModel } from "@/lib/communities/careModel";
import type { Community } from "@/lib/supabase/types";

// The closed <select> is styled light-on-navy (see className below) to
// match the header, but the OPENED native dropdown popup is a separate
// browser-rendered surface that does not reliably inherit that styling —
// confirmed broken (invisible white-on-white options) in Edge/Chrome.
// <option>/<optgroup> get their own explicit inline styles, independent
// of the <select>'s className, matching this app's real light-surface
// tokens (app/globals.css: --color-body, --color-surface, --color-navy)
// rather than a bare "black on white" guess. Native browsers do not
// support styling an option's :hover/:checked highlight via CSS at all —
// that state uses the OS/browser's own system accent color, which
// already guarantees its own contrast; only the resting (unselected,
// unhovered) state needed fixing here.
// paddingRight gives the longest option label ("Watermere at Firewheel")
// breathing room before the popup's edge — the popup itself is sized by
// the browser to fit its content plus this padding, so this is also what
// keeps the opened dropdown from crowding text against its right
// boundary (there is no separate CSS hook for the popup surface itself).
const OPTION_STYLE = { color: "#1E2328", backgroundColor: "#FFFFFF", paddingRight: "20px" };
const OPTGROUP_STYLE = { color: "#2F3F57", backgroundColor: "#FFFFFF", fontWeight: 600, paddingRight: "20px" };

export interface CommunitySwitcherData {
  readonly communities: Community[];
  // A communities.id, ALL_COMMUNITIES_SELECTION, or "" when the current
  // scope has nothing to reflect (unassigned/non_community) — the select
  // shows a disabled placeholder in that case rather than guessing.
  readonly currentSelection: string;
  readonly canSelectAll: boolean;
}

interface CommunitySwitcherProps extends CommunitySwitcherData {
  variant?: "desktop" | "mobile";
}

// One canonical switcher, rendered by TopNav (desktop) and MobileHeader
// (mobile) — never a page-specific selector. A native <select> rather than
// a custom popover: flawless mobile picker behavior for free, no
// outside-click/positioning logic to get wrong, and this is exactly the
// kind of control where "visually clear but not dominant" favors something
// unglamorous over a custom-built menu.
export function CommunitySwitcher({
  communities,
  currentSelection,
  canSelectAll,
  variant = "desktop",
}: CommunitySwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (communities.length === 0) {
    return null;
  }

  function handleChange(next: string) {
    if (!next || next === currentSelection) return;
    startTransition(async () => {
      const result = await setCurrentCommunityAction(next);
      // On error, intentionally leave the select as-is — the next render
      // (driven by the still-unchanged cookie) reasserts the prior value.
      // No toast/alert surface exists yet to report this more softly.
      if (!result.error) {
        router.refresh();
      }
    });
  }

  const isCompact = variant === "mobile";
  const grouped = groupCommunitiesByCareModel(communities);

  return (
    <div className="relative flex items-center">
      <Building2
        size={14}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-2.5 text-white/55"
      />
      <select
        aria-label="Current community"
        value={currentSelection}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        className={`appearance-none truncate rounded-lg border border-white/16 bg-white/6 pl-8 pr-7 font-sans font-medium text-white/90 outline-none transition-colors hover:bg-white/10 focus:border-gold/60 disabled:opacity-60 ${
          isCompact
            ? "h-9 w-[118px] text-xs"
            : // Stable desktop width, not resized per selection — wide
              // enough to show "Watermere at Firewheel" (the longest
              // current community name) in full, including the leading
              // icon and trailing chevron, without truncating. h-11 matches
              // TopNav's own control height (the search input, notification
              // bell, user chip, and logout button are all h-11) — the two
              // controls sit side by side in the same header and need the
              // same height, not just the same border-radius, to read as
              // one consistent row rather than two mismatched pieces.
              "h-11 w-[244px] min-w-[244px] text-sm"
        }`}
      >
        {!currentSelection && (
          <option value="" disabled style={OPTION_STYLE}>
            Select a community
          </option>
        )}
        {canSelectAll && (
          <option value={ALL_COMMUNITIES_SELECTION} style={OPTION_STYLE}>
            All Communities
          </option>
        )}
        {(Object.keys(grouped) as Array<keyof typeof grouped>).map((careModel) =>
          grouped[careModel].length > 0 ? (
            <optgroup key={careModel} label={CARE_MODEL_LABELS[careModel]} style={OPTGROUP_STYLE}>
              {grouped[careModel].map((community) => (
                <option key={community.id} value={community.id} style={OPTION_STYLE}>
                  {community.name}
                </option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>
      <ChevronDown
        size={13}
        strokeWidth={2}
        className="pointer-events-none absolute right-2.5 text-white/45"
      />
    </div>
  );
}
