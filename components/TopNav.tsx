import { Search, Bell, LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import type { CurrentUserDisplay } from "@/lib/auth/display";

interface TopNavProps {
  title?: string;
  currentUser: CurrentUserDisplay;
}

export function TopNav({ title = "Dashboard", currentUser }: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-6 border-b border-white/10 bg-navy px-8">
      {/* Page title */}
      <div className="flex-1">
        <p className="font-sans text-label font-semibold uppercase tracking-[0.16em] text-white/55">
          {title}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45"
        />
        <input
          type="text"
          placeholder="Search anything…"
          className="h-11 w-72 rounded-lg border border-white/16 bg-white/6 pl-10 pr-4 font-sans text-sm text-white/95 outline-none transition-all placeholder:text-white/45 focus:border-gold/60 focus:bg-white/12"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-white/65 transition-colors hover:bg-white/10 hover:text-white/95"
        >
          <Bell size={18} strokeWidth={1.5} />
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-gold" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-white/14" />

        {/* User chip */}
        <button type="button" className="flex h-11 items-center gap-2.5 rounded-lg px-2.5 transition-colors hover:bg-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 font-sans text-[12px] font-semibold text-gold-light">
            {currentUser.initials}
          </div>
          <span className="font-sans text-sm font-medium text-white/95">
            {currentUser.shortName}
          </span>
        </button>

        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Log out"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/65 transition-colors hover:bg-white/10 hover:text-white/95"
          >
            <LogOut size={18} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </header>
  );
}
