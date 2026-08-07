import Link from "next/link";

export type PeopleWeServeView = "residents" | "clients" | "externalClients" | "relationships" | "reconciliation";

// Ordering/composition rationale (People We Serve refactor):
// - Residents: the canonical community population.
// - Serve Clients ("clients", was "AxisCare Clients" / /axiscare-clients,
//   redirected — see app/axiscare-clients/page.tsx): real Serve clients,
//   sourced from AxisCare (Serve's canonical external client
//   repository), never described to the user as vendor-owned.
// - External Clients: kept as its own tab, not folded into
//   Reconciliation or removed — investigated directly
//   (lib/data/externalClients.ts, lib/externalClients/search.ts) and
//   confirmed to be a real, distinct business concept (people served
//   outside a supported community, tracked through the Relationships
//   CRM + a dedicated external_clients table), not implementation or
//   reconciliation machinery kept around out of inertia.
// - Relationships: the CRM/pipeline system.
// - Reconciliation: vendor records that are not real Serve clients,
//   ambiguous identity matches, and other admin/vendor cleanup — home
//   for anything that isn't a settled, presentable Serve concept yet.
const VIEWS: { value: PeopleWeServeView; label: string; href: string }[] = [
  { value: "residents", label: "Residents", href: "/residents" },
  { value: "clients", label: "Serve Clients", href: "/clients" },
  { value: "externalClients", label: "External Clients", href: "/external-clients" },
  { value: "relationships", label: "Relationships", href: "/relationships" },
  { value: "reconciliation", label: "Reconciliation", href: "/reconciliation" },
];

// The People We Serve's shared view switcher — everything but Residents
// is intentionally not a separate top-level sidebar entry; this is how
// they stay reachable as clearly-labeled sub-areas instead. Styled
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
