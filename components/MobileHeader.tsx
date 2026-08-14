"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "./Logo";
import { MobileNavDrawer } from "./MobileNavDrawer";
import type { CurrentUserDisplay } from "@/lib/auth/display";

interface MobileHeaderProps {
  title?: string;
  currentUser: CurrentUserDisplay;
}

// Phone-width-only compact app header (hidden at md: and above — TopNav.tsx
// remains the desktop header, hidden below md:). Deliberately does NOT
// reproduce TopNav's search/notifications/profile controls — those are
// desktop-only progressive disclosure, not shrunk down (Phase 2). Just
// enough to answer "where am I" (title) and "how do I get somewhere else"
// (the hamburger). The 44px touch target on the trigger is a real hit area,
// not just the visible icon size.
export function MobileHeader({ title, currentUser }: MobileHeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-navy px-3 md:hidden">
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={isDrawerOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          <Menu size={22} strokeWidth={1.75} />
        </button>

        {/* Points at People We Serve, not Today's Work — the mobile home
            is intentionally narrower than desktop right now (see
            MobileNavDrawer.tsx), and a logo-tap "home" affordance that
            led into Today's Work would quietly contradict that. Desktop's
            Sidebar logo is a separate component and still points at
            Today's Work, unchanged. */}
        <Link href="/residents" aria-label="Go to The People We Serve" className="shrink-0">
          <Logo width={84} />
        </Link>

        {title && (
          <p className="min-w-0 flex-1 truncate text-right font-sans text-label font-semibold uppercase tracking-[0.14em] text-white/55">
            {title}
          </p>
        )}
      </header>

      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} currentUser={currentUser} />
    </>
  );
}
