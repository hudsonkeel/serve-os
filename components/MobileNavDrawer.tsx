"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Logo } from "./Logo";
import type { CurrentUserDisplay } from "@/lib/auth/display";
import { NAV_SECTIONS, NAV_COMING_SOON, NAV_UTILITY } from "@/lib/navigation/primaryNav";

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
          <Link href="/workspace" aria-label="Go to Today's Work" onClick={onClose}>
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
          {NAV_SECTIONS.map((section) => (
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
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="mt-6 border-t border-white/10 pt-6">
            <p className="mb-2 px-4 font-sans text-label font-semibold uppercase tracking-[0.18em] text-white/35">
              Coming Soon
            </p>
            <ul className="space-y-1">
              {NAV_COMING_SOON.map((item) => (
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

          <div className="mt-6 space-y-1 border-t border-white/10 pt-6">
            {NAV_UTILITY.map((item) => {
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
