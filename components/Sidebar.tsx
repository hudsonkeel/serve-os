"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { Logo } from "./Logo";
import type { CurrentUserDisplay } from "@/lib/auth/display";

// Preserves the navigation model users already understand — Today's Work
// as the sole operational home, The People We Serve as one destination for
// the whole resident/client relationship realm, Workforce covering the
// full lifecycle of people who may/do/did serve. See DECISION_LOG.md
// ("Serve OS navigation shell") for the retirement of "The People Who
// Serve" as a separate destination and why there is no standalone
// Dashboard in this release.
//
// Relationships and External Clients remain fully functional at their
// existing routes — they're reached from within The People We Serve, not
// duplicated as separate top-level entries. Recruiting remains fully
// functional at /recruiting — reached as Workforce's Hiring Pipeline, not
// duplicated as a separate top-level entry either.
const sections = [
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
      { icon: LayoutDashboard, label: "How We're Doing", href: "/" },
      { icon: BarChart2, label: "Community Outlook", href: "/community-intelligence" },
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

        {/* Utility area — Ask Serve + Settings, deliberately outside the
            Today/Serve/Understand work hierarchy above. */}
        <div className="mt-6 space-y-1 border-t border-white/10 pt-6">
          <Link
            href="/ask-serve"
            aria-current={isActive("/ask-serve") ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded-lg border-l-[3px] px-4 py-3 font-sans text-button tracking-wide transition-all duration-150 ${
              isActive("/ask-serve")
                ? "border-l-gold bg-gold/15 font-semibold text-gold-light"
                : "border-l-transparent text-white/70 hover:bg-white/8 hover:text-white/95"
            }`}
          >
            <Sparkles size={17} strokeWidth={isActive("/ask-serve") ? 2 : 1.5} className="shrink-0" />
            <span>Ask Serve</span>
          </Link>
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
