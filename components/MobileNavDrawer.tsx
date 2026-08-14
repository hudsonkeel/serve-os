"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, LogOut } from "lucide-react";
import { Logo } from "./Logo";
import type { CurrentUserDisplay } from "@/lib/auth/display";
import { NAV_SECTIONS, NAV_UTILITY } from "@/lib/navigation/primaryNav";
import { logoutAction } from "@/lib/auth/actions";

// Mobile release scope: the mobile product is intentionally narrower than
// desktop right now — "The People We Serve" is the only operational
// destination that has been designed/tested for mobile, so it's the only
// one offered here ("do not offer a door until the room behind it is
// ready"). Derived from NAV_SECTIONS (never hardcoded) so this can never
// silently drift from the real destination's label/icon/href — desktop's
// Sidebar still shows the complete set unchanged, since NAV_SECTIONS
// itself isn't touched, only filtered at render time, here only.
const PEOPLE_WE_SERVE_NAV_ITEM = NAV_SECTIONS.flatMap((section) => section.items).find(
  (item) => item.href === "/residents"
);

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CurrentUserDisplay;
}

// Phone-width navigation — a temporary overlay drawer, not a persistent
// pane. Reuses the exact backdrop/portal/focus-trap/Escape pattern already
// proven in AskServePanel.tsx (the only modal-style primitive that existed
// in this repo before this component) rather than inventing a third
// pattern. Reuses NAV_SECTIONS/NAV_COMING_SOON/NAV_UTILITY from
// lib/navigation/primaryNav.ts — the exact same destinations, permissions,
// and labels as the desktop Sidebar, never a second hard-coded tree.
export function MobileNavDrawer({ isOpen, onClose, currentUser }: MobileNavDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;

      const focusableEls = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex md:hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-navy-deep/40" aria-hidden="true" onClick={onClose} />

      {/* Drawer — slides in from the left, over the page. The page underneath
          never moves/pushes; this is an overlay, not a second layout column. */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="relative flex h-full w-[82vw] max-w-[320px] flex-col overflow-y-auto bg-navy shadow-sidebar"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <Link href="/residents" aria-label="Go to The People We Serve" onClick={onClose}>
            <Logo width={112} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Primary">
          {/* Deliberately narrow for this mobile release — see the
              PEOPLE_WE_SERVE_NAV_ITEM comment above. Today's Work,
              Workforce, How We're Doing, Community Outlook, Ask Serve, and
              Coming Soon are all withheld from mobile navigation, not
              removed: every one of them is still a full destination on
              desktop (NAV_SECTIONS/NAV_COMING_SOON are untouched — this
              file just doesn't render most of them below md:), and a
              direct URL still loads if someone types one in on their
              phone (deliberately not blocked — see the completion
              report). */}
          {PEOPLE_WE_SERVE_NAV_ITEM && (
            <div className="mb-5">
              <ul className="space-y-1">
                <li>
                  <Link
                    href={PEOPLE_WE_SERVE_NAV_ITEM.href}
                    onClick={onClose}
                    aria-current={isActive(PEOPLE_WE_SERVE_NAV_ITEM.href) ? "page" : undefined}
                    className={`flex min-h-[44px] items-center gap-3 rounded-lg border-l-[3px] px-4 py-3 font-sans text-button tracking-wide transition-all duration-150 ${
                      isActive(PEOPLE_WE_SERVE_NAV_ITEM.href)
                        ? "border-l-gold bg-gold/15 font-semibold text-gold-light"
                        : "border-l-transparent text-white/70 hover:bg-white/8 hover:text-white/95"
                    }`}
                  >
                    <PEOPLE_WE_SERVE_NAV_ITEM.icon
                      size={17}
                      strokeWidth={isActive(PEOPLE_WE_SERVE_NAV_ITEM.href) ? 2 : 1.5}
                      className="shrink-0"
                    />
                    <span>{PEOPLE_WE_SERVE_NAV_ITEM.label}</span>
                  </Link>
                </li>
              </ul>
            </div>
          )}

          <div className="mt-6 space-y-1 border-t border-white/10 pt-6">
            {/* Only genuinely necessary account/session utilities — Ask
                Serve is excluded here too (matches AskServeTrigger.tsx's
                own mobile suppression), NAV_UTILITY itself untouched so
                desktop is unaffected. */}
            {NAV_UTILITY.filter((item) => item.href !== "/ask-serve").map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
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
              );
            })}
            {/* Sign Out did not exist anywhere in the mobile experience
                before this — TopNav.tsx's logout button is hidden below
                md: along with the rest of that header, and nothing
                replaced it. Same logoutAction server action TopNav.tsx
                already uses; no new auth logic. */}
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border-l-[3px] border-l-transparent px-4 py-3 font-sans text-button tracking-wide text-white/70 transition-all duration-150 hover:bg-white/8 hover:text-white/95"
              >
                <LogOut size={17} strokeWidth={1.5} className="shrink-0" />
                <span>Sign Out</span>
              </button>
            </form>
          </div>
        </nav>

        <div className="border-t border-white/10 px-4 py-5">
          <div className="flex items-center gap-3 rounded-lg px-3 py-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-subtle font-sans text-sm font-semibold text-gold-dark">
              {currentUser.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-sans text-sm font-medium text-white/95">{currentUser.fullName}</p>
              <p className="truncate font-sans text-label text-white/55">{currentUser.roleLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
