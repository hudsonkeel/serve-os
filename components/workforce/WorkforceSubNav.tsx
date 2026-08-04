import Link from "next/link";

// The coherent entry point into the Workforce journey — one Workforce
// experience spanning the hiring pipeline through active/inactive/
// terminated employment, without merging the underlying recruiting_leads
// and workforce_members data models. "Hiring Pipeline" links to the
// existing, unmodified /recruiting route rather than a new page —
// recruiting keeps its own already-committed, fully working experience;
// Workforce simply becomes the coherent place operations lands to reach
// it. Onboarding/Active/Inactive/Terminated reuse the roster's own
// existing lifecycle filters (no new query logic); Identity Review reuses
// the existing route. Also rendered (as a breadcrumb) at the top of
// /recruiting itself, so arriving there directly still reads as
// Workforce → Hiring Pipeline.
const WORKFORCE_SUB_NAV: Array<{ label: string; href: string }> = [
  { label: "Overview", href: "/workforce" },
  { label: "Hiring Pipeline", href: "/recruiting" },
  { label: "Onboarding", href: "/workforce?filter=pending_start" },
  { label: "Active", href: "/workforce?filter=active" },
  { label: "Inactive", href: "/workforce?filter=inactive" },
  { label: "Terminated", href: "/workforce?filter=terminated" },
  { label: "Identity Review", href: "/workforce/identity-review" },
];

export function WorkforceSubNav({ active }: { active: "overview" | "hiring-pipeline" | "identity-review" | null }) {
  return (
    <nav aria-label="Workforce" className="mb-6 flex flex-wrap gap-1.5 border-b border-ivory-border pb-4">
      {WORKFORCE_SUB_NAV.map((item) => {
        const isOverview = item.label === "Overview";
        const isHiringPipeline = item.label === "Hiring Pipeline";
        const isIdentityReview = item.label === "Identity Review";
        const isActive =
          (active === "overview" && isOverview) ||
          (active === "hiring-pipeline" && isHiringPipeline) ||
          (active === "identity-review" && isIdentityReview);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`rounded-full px-3.5 py-1.5 font-sans text-xs font-medium transition-colors ${
              isActive
                ? "bg-navy text-white"
                : "border border-ivory-border bg-surface text-muted hover:border-navy/20 hover:text-body"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
