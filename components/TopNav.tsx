import { Search, Bell, LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";

interface TopNavProps {
  title?: string;
}

export function TopNav({ title = "Dashboard" }: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 flex h-[65px] items-center gap-6 border-b border-ivory-border bg-white px-8">
      {/* Page title */}
      <div className="flex-1">
        <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
          {title}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
        />
        <input
          type="text"
          placeholder="Search anything…"
          className="h-9 w-72 rounded-lg border border-ivory-border bg-ivory pl-9 pr-4 font-sans text-sm text-navy outline-none transition-all placeholder:text-subtle focus:border-gold/50 focus:bg-white"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button type="button" aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-ivory">
          <Bell size={17} strokeWidth={1.5} />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold" />
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-ivory-border" />

        {/* User chip */}
        <button type="button" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-ivory">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy/8 font-sans text-[11px] font-medium text-navy">
            EB
          </div>
          <span className="font-sans text-sm font-medium text-navy">Elizabeth</span>
        </button>

        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Log out"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-ivory hover:text-navy"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </header>
  );
}
