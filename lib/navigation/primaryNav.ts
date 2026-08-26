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
  ClipboardCheck,
  Activity,
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
  // Governance is the organizational realm — the cross-domain systems that
  // define, evaluate, document, and demonstrate how Serve operates, as
  // distinct from Serve's operational people/domains above. Audit
  // Readiness is the first product to live here; the product itself keeps
  // its own name (Governance is the realm, not a rename). Quality (QAPI)
  // is the second (2026-08-25) — a distinct leadership view over the same
  // underlying readiness/compliance data ("what are we learning / what
  // needs attention" vs. Audit Readiness's "can we prove it right now"),
  // never a duplicate evaluator — see lib/qapi/dashboard.ts. Emergency
  // Preparedness is deliberately NOT a third top-level item here: it stays
  // a capability reached from within Audit Readiness (its dashboard's own
  // Start Audit Drill / View Past Audits actions), same as Audit Drills.
  {
    heading: "Governance",
    items: [
      // Desktop-only for v0.1 — MobileNavDrawer.tsx renders its own
      // hard-coded, narrow item list (The People We Serve + NAV_UTILITY
      // only) rather than mapping NAV_SECTIONS directly, so adding these
      // entries here does not put them in the phone-width drawer. See the
      // Audit Readiness Phase 1 report for why this stays desktop-only —
      // the Aug 26 drill workflow is a tablet/desktop task; QAPI inherits
      // the same reasoning as a peer Governance destination.
      { icon: ClipboardCheck, label: "Audit Readiness", href: "/audit-readiness" },
      { icon: Activity, label: "Quality (QAPI)", href: "/qapi" },
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
