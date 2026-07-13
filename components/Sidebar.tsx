"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  LayoutDashboard,
  Users,
  BarChart2,
  Sparkles,
  MessageSquare,
  Settings,
} from "lucide-react";
import { Logo } from "./Logo";
import type { CurrentUserDisplay } from "@/lib/auth/display";

// Core operating areas — Dashboard = Know, Workspace = Do, Residents =
// Manage, Community Intelligence = Think proactively, Ask Serve = Think on
// demand. See docs/architecture/SERVE_OS_NAVIGATION_MODEL.md.
const primaryNav = [
  { icon: Briefcase,       label: "Workspace",              href: "/workspace" },
  { icon: LayoutDashboard, label: "Dashboard",              href: "/" },
  { icon: Users,           label: "Residents",             href: "/residents" },
  { icon: BarChart2,       label: "Community Intelligence", href: "/community-intelligence" },
  { icon: Sparkles,        label: "Ask Serve",             href: "/ask-serve" },
];

// Communications is the only "Coming Soon" item — Recruiting, Scheduling,
// and Care Plans were removed from the sidebar (not deleted) per the
// navigation model. Recruiting is reachable from Workspace; Scheduling and
// Care Plans have no dedicated route yet.
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
      <nav className="flex-1 overflow-y-auto px-4 py-6">

        {/* Primary nav */}
        <ul className="space-y-1">
          {primaryNav.map((item) => {
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
