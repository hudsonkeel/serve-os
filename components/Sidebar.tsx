"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  LayoutDashboard,
  Users,
  Handshake,
  Home,
  ShieldCheck,
  BarChart2,
  Sparkles,
  MessageSquare,
  Settings,
} from "lucide-react";
import { Logo } from "./Logo";
import type { CurrentUserDisplay } from "@/lib/auth/display";

// Grouped by the operating flow: do the day's work, work with the people
// Serve serves and the people who provide that care, then understand
// performance and emerging conditions. See
// docs/architecture/SERVE_OS_NAVIGATION_MODEL.md.
//
// "The People Who Serve" (recruiting) is deliberately NOT a top-level
// destination here — recruiting is reachable as a Candidates entry point
// from within Workforce (see the Workforce page's own sub-navigation),
// preserving the existing /recruiting route without duplicating it as a
// second primary nav concept.
const sections = [
  {
    heading: "Work",
    items: [
      { icon: Briefcase, label: "Workspace", href: "/workspace" },
      { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    ],
  },
  {
    heading: "Serve",
    items: [
      { icon: Users, label: "Residents", href: "/residents" },
      { icon: Handshake, label: "Relationships", href: "/relationships" },
      { icon: Home, label: "External Clients", href: "/external-clients" },
      { icon: ShieldCheck, label: "Workforce", href: "/workforce" },
    ],
  },
  {
    heading: "Understand",
    items: [
      { icon: BarChart2, label: "Community Intelligence", href: "/community-intelligence" },
      { icon: Sparkles, label: "Ask Serve", href: "/ask-serve" },
    ],
  },
];

// Communications is the only "Coming Soon" item — Scheduling and Care
// Plans have no dedicated route yet.
const comingSoonNav = [
  { icon: MessageSquare,   label: "Communications" },
];

export function Sidebar({ currentUser }: { currentUser: CurrentUserDisplay }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col bg-navy shadow-sidebar">
      {/* ─── Logo ─── */}
      <div className="border-b border-white/8 px-6 py-4">
        <Logo width={120} />
      </div>

      {/* ─── Navigation ─── */}
      <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Primary">
        {/* Grouped primary nav */}
        {sections.map((section) => (
          <div key={section.heading} className="mb-5 last:mb-0">
            <p className="mb-2 px-4 font-sans text-label font-semibold uppercase tracking-[0.18em] text-white/35">
              {section.heading}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[44px] items-center gap-3 rounded-lg border-l-[3px] px-4 py-3 font-sans text-button tracking-wide transition-all duration-150 ${
                        active
                          ? "border-l-gold bg-gold/15 font-semibold text-gold-light"
                          : "border-l-transparent text-white/70 hover:bg-white/8 hover:text-white/95"
                      }`}
                    >
                      <item.icon size={17} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Coming Soon — dimmed, non-interactive */}
        <div className="mt-6 border-t border-white/10 pt-6">
          <p className="mb-2 px-4 font-sans text-label font-semibold uppercase tracking-[0.18em] text-white/35">
            Coming Soon
          </p>
          <ul className="space-y-1">
            {comingSoonNav.map((item) => (
              <li key={item.label}>
                <span
                  aria-disabled="true"
                  className="flex min-h-[44px] cursor-default items-center gap-3 rounded-lg border-l-[3px] border-l-transparent px-4 py-3 font-sans text-button tracking-wide text-white/35"
                >
                  <item.icon size={17} strokeWidth={1.5} className="shrink-0" />
                  <span>{item.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* System */}
        <div className="mt-6 border-t border-white/10 pt-6">
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded-lg border-l-[3px] px-4 py-3 font-sans text-button tracking-wide transition-all duration-150 ${
              isActive("/settings")
                ? "border-l-gold bg-gold/15 font-semibold text-gold-light"
                : "border-l-transparent text-white/70 hover:bg-white/8 hover:text-white/95"
            }`}
          >
            <Settings size={17} strokeWidth={isActive("/settings") ? 2 : 1.5} className="shrink-0" />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* ─── User ─── */}
      <div className="border-t border-white/10 px-4 py-5">
        <div className="flex items-center gap-3 rounded-lg px-3 py-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-subtle font-sans text-sm font-semibold text-gold-dark">
            {currentUser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-sm font-medium text-white/95">
              {currentUser.fullName}
            </p>
            <p className="truncate font-sans text-label text-white/55">
              {currentUser.roleLabel}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
