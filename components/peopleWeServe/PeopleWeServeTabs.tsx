import Link from "next/link";

export type PeopleWeServeView = "residents" | "relationships" | "externalClients";

const VIEWS: { value: PeopleWeServeView; label: string; href: string }[] = [
  { value: "residents", label: "Residents", href: "/residents" },
  { value: "relationships", label: "Relationships", href: "/relationships" },
  { value: "externalClients", label: "External Clients", href: "/external-clients" },
];

// The People We Serve's shared view switcher — Relationships and External
// Clients are intentionally not separate top-level sidebar entries; this is
// how they stay reachable as clearly-labeled sub-areas instead. Styled
// identically to components/relationships/RelationshipViewTabs.tsx (which
// stays untouched and renders BELOW this one on every /relationships*
// page, giving a two-level "The People We Serve > Relationships > Action
// Board" hierarchy without a new breadcrumb component).
export function PeopleWeServeTabs({ active }: { active: PeopleWeServeView }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-ivory-border">
      {VIEWS.map((view) => {
        const isActive = view.value === active;
        return (
          <Link
            key={view.value}
            href={view.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
              isActive
                ? "border-b-navy text-navy"
                : "border-b-transparent text-muted hover:text-body"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
