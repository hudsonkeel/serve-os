"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  BarChart2,
  Sparkles,
  Calendar,
  MessageSquare,
  ClipboardList,
  Settings,
} from "lucide-react";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";

const primaryNav = [
  { icon: LayoutDashboard, label: "Dashboard",              href: "/" },
  { icon: Users,           label: "Residents",             href: "/residents" },
  { icon: UserPlus,        label: "Recruiting",            href: "/recruiting" },
  { icon: BarChart2,       label: "Community Intelligence", href: "/community-intelligence" },
  { icon: Sparkles,        label: "Ask Serve",             href: "/ask-serve" },
];

const futureNav = [
  { icon: Calendar,        label: "Scheduling" },
  { icon: MessageSquare,   label: "Communications" },
  { icon: ClipboardList,   label: "Care Plans" },
];

export function Sidebar() {
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
        <ul className="space-y-0.5">
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg border-l-2 px-4 py-2.5 font-sans text-sm tracking-wide transition-all duration-150 ${
                    active
                      ? "border-l-gold bg-gold/10 text-gold"
                      : "border-l-transparent text-white/45 hover:bg-white/5 hover:text-white/75"
                  }`}
                >
                  <item.icon size={15} strokeWidth={1.5} className="shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Future nav — dimmed, non-interactive */}
        <div className="mt-6 border-t border-white/6 pt-6">
          <p className="mb-2 px-4 font-sans text-[9px] font-medium uppercase tracking-[0.2em] text-white/20">
            Coming Soon
          </p>
          <ul className="space-y-0.5">
            {futureNav.map((item) => (
              <li key={item.label}>
                <span className="flex cursor-default items-center gap-3 rounded-lg border-l-2 border-l-transparent px-4 py-2.5 font-sans text-sm tracking-wide text-white/20">
                  <item.icon size={15} strokeWidth={1.5} className="shrink-0" />
                  <span>{item.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Settings */}
        <div className="mt-6 border-t border-white/6 pt-6">
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-lg border-l-2 px-4 py-2.5 font-sans text-sm tracking-wide transition-all duration-150 ${
              isActive("/settings")
                ? "border-l-gold bg-gold/10 text-gold"
                : "border-l-transparent text-white/35 hover:text-white/60"
            }`}
          >
            <Settings size={15} strokeWidth={1.5} className="shrink-0" />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* ─── User ─── */}
      <div className="border-t border-white/8 px-4 py-5">
        <div className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-white/5">
          <UserAvatar firstName="Elizabeth" lastName="Butler" size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-xs font-medium text-white/80">
              Elizabeth Butler
            </p>
            <p className="truncate font-sans text-[11px] text-white/32">
              Care Coordinator
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
