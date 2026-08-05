import Link from "next/link";

// Additive only — rendered alongside a page's existing local back-link
// (e.g. "Back to Residents"), never in place of it, and only when the
// page was reached via a Today's Work item
// (lib/workspace/originMarker.ts). See
// docs/architecture/TODAYS_WORK_OPERATIONAL_HOME.md.
export function BackToTodaysWorkLink() {
  return (
    <Link
      href="/workspace"
      className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
    >
      ← Back to Today&apos;s Work
    </Link>
  );
}
