// The single source of truth for Serve OS's primary navigation — consumed by
// both the desktop Sidebar and the mobile MobileNavDrawer. Extracted from
// Sidebar.tsx (where this data previously lived inline) specifically so the
// mobile shell reuses the exact same destinations/permissions/labels rather
// than hard-coding a second navigation tree — see DECISION_LOG.md ("Serve OS
// navigation shell") for why this destination set/grouping was chosen.
//
// This file is the UI-facing layer only: it attaches icons to the pure,
// icon-free destination data in ./navData.ts (which holds the actual
// label/href/roles facts and the role-visibility filtering logic — see
// its own header comment for why it's kept separate and UI-import-free).
// Exports here are unchanged in name/shape from before that split, so
// nothing consuming this file (Sidebar.tsx, MobileNavDrawer.tsx) needed
// to change.
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  LayoutDashboard,
  Users,
  ShieldCheck,
  BarChart2,
  MessageSquare,
  Sparkles,
  Settings,
  ClipboardCheck,
  Activity,
} from "lucide-react";
import type { AuthRole } from "../auth/constants.ts";
import {
  NAV_SECTIONS_DATA,
  NAV_UTILITY_DATA,
  getVisibleNavSectionsData,
  getVisibleUtilityItemsData,
  type NavDestination,
} from "./navData.ts";

export interface NavItem extends NavDestination {
  icon: LucideIcon;
}

// A "Coming Soon" item deliberately has no href at all — it has nowhere to
// link to yet, and is rendered as inert (non-interactive) text, never a
// disabled-looking Link.
export interface NavComingSoonItem {
  icon: LucideIcon;
  label: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

// Keyed by href — every destination in navData.ts must have an entry
// here, or it renders with no icon.
const ICONS_BY_HREF: Record<string, LucideIcon> = {
  "/workspace": Briefcase,
  "/residents": Users,
  "/workforce": ShieldCheck,
  "/audit-readiness": ClipboardCheck,
  "/qapi": Activity,
  "/dashboard": LayoutDashboard,
  "/community-intelligence": BarChart2,
  "/ask-serve": Sparkles,
  "/settings": Settings,
};

function withIcon(item: NavDestination): NavItem {
  return { ...item, icon: ICONS_BY_HREF[item.href] };
}

export const NAV_SECTIONS: NavSection[] = NAV_SECTIONS_DATA.map((section) => ({
  heading: section.heading,
  items: section.items.map(withIcon),
}));

// Communications is the only "Coming Soon" item — Scheduling and Care Plans
// have no dedicated route yet.
export const NAV_COMING_SOON: NavComingSoonItem[] = [{ icon: MessageSquare, label: "Communications" }];

// Utility area — Ask Serve + Settings, deliberately outside the
// Today/Serve/Understand work hierarchy above.
export const NAV_UTILITY: NavItem[] = NAV_UTILITY_DATA.map(withIcon);

// Role-aware filtering, consumed by both Sidebar.tsx and
// MobileNavDrawer.tsx so neither hand-rolls its own role check against
// this data. Delegates the actual filtering to navData.ts (see its tests
// for the role-visibility matrix) and only adds icons on top.
export function getVisibleNavSections(role: AuthRole | null | undefined): NavSection[] {
  return getVisibleNavSectionsData(role).map((section) => ({
    heading: section.heading,
    items: section.items.map(withIcon),
  }));
}

export function getVisibleUtilityItems(role: AuthRole | null | undefined): NavItem[] {
  return getVisibleUtilityItemsData(role).map(withIcon);
}
