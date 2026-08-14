import Link from "next/link";

// "relationships"/"externalClients" are accepted for backward
// compatibility with app/relationships/*.tsx and
// app/external-clients/page.tsx (kept fully functional at their
// existing routes, no longer primary tabs — see the comment below) —
// passing either simply renders the 4 primary tabs with none marked
// active, rather than breaking those pages' compilation.
export type PeopleWeServeView = "residents" | "clients" | "prospects" | "reconciliation" | "relationships" | "externalClients";

// Primary People We Serve navigation, per the corrected ontology:
// Residents | Serve Clients | Prospects | Reconciliation.
//
// - Residents: the canonical community population.
// - Serve Clients ("clients", was "AxisCare Clients" / /axiscare-clients,
//   redirected): real Serve clients, sourced from AxisCare (Serve's
//   canonical external client repository), never described to the user
//   as vendor-owned.
// - Prospects (was the "Relationships" tab — Relationships is no longer
//   a competing primary destination now that its prospect-facing CRM
//   functionality is reachable here): who Serve may go on to serve. The
//   mature Relationships CRM engine (owner/stage/next action/touches/
//   notes/service opportunity) is reused, not rebuilt or deleted — see
//   app/prospects/page.tsx. Non-prospect relationships (referral
//   partners, resident-linked active clients, etc.) remain reachable at
//   /relationships, linked contextually from Prospects rather than
//   competing for a nav slot.
// - Reconciliation: vendor records that are not real Serve clients,
//   ambiguous identity matches, and other admin/vendor cleanup.
//
// External Clients (people served outside a supported community) was
// investigated directly and found to be a genuinely distinct business
// entity — not AxisCare-derived, not reconciliation machinery — so it
// is preserved, fully functional, at its existing route
// (/external-clients) rather than deleted. It is intentionally not a
// top-level tab here; it's reachable contextually (e.g. from
// Prospects) pending a decision on whether "Non-Community/External"
// should instead become a community-affiliation filter within Serve
// Clients/Prospects (the community-context foundation added alongside
// this navigation change already models "Non-Community/External" as
// exactly that kind of state) rather than a separate population.
const VIEWS: { value: PeopleWeServeView; label: string; href: string }[] = [
  { value: "residents", label: "Residents", href: "/residents" },
  { value: "clients", label: "Serve Clients", href: "/clients" },
  { value: "prospects", label: "Prospects", href: "/prospects" },
  { value: "reconciliation", label: "Reconciliation", href: "/reconciliation" },
];

// The People We Serve's shared view switcher — none of these are
// separate top-level sidebar entries; this is how they stay reachable
// as clearly-labeled sub-areas instead. Styled identically to
// components/relationships/RelationshipViewTabs.tsx (which stays
// untouched and renders BELOW this one on every /relationships* page).
export function PeopleWeServeTabs({ active }: { active: PeopleWeServeView }) {
  return (
    // Horizontally scrollable, never wrapping — a phone-width viewport
    // can't fit 4 tabs on one line at a readable size, and wrapping to a
    // second row reads as a "button wall" (explicitly avoided). A
    // horizontal strip is a familiar mobile tab pattern; at desktop widths
    // all 4 fit with no scrolling needed, so this is a no-op there.
    <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-ivory-border">
      {VIEWS.map((view) => {
        const isActive = view.value === active;
        return (
          <Link
            key={view.value}
            href={view.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
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
