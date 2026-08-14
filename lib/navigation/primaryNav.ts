// The single source of truth for Serve OS's primary navigation — consumed by
// both the desktop Sidebar and the mobile MobileNavDrawer. Extracted from
// Sidebar.tsx (where this data previously lived inline) specifically so the
// mobile shell reuses the exact same destinations/permissions/labels rather
// than hard-coding a second navigation tree — see DECISION_LOG.md ("Serve OS
// navigation shell") for why this destination set/grouping was chosen.
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
} from "lucide-react";

export interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
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

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Today",
    items: [{ icon: Briefcase, label: "Today's Work", href: "/workspace" }],
  },
  {
    heading: "Serve",
    items: [
      { icon: Users, label: "The People We Serve", href: "/residents" },
      { icon: ShieldCheck, label: "Workforce", href: "/workforce" },
    ],
  },
  {
    heading: "Understand",
    items: [
      { icon: LayoutDashboard, label: "How We're Doing", href: "/dashboard" },
      { icon: BarChart2, label: "Community Outlook", href: "/community-intelligence" },
    ],
  },
];

// Communications is the only "Coming Soon" item — Scheduling and Care Plans
// have no dedicated route yet.
export const NAV_COMING_SOON: NavComingSoonItem[] = [{ icon: MessageSquare, label: "Communications" }];

// Utility area — Ask Serve + Settings, deliberately outside the
// Today/Serve/Understand work hierarchy above.
export const NAV_UTILITY: NavItem[] = [
  { icon: Sparkles, label: "Ask Serve", href: "/ask-serve" },
  { icon: Settings, label: "Settings", href: "/settings" },
];
