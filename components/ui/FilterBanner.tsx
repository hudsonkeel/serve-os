import Link from "next/link";

interface FilterBannerProps {
  /** What the filter means, in plain language — e.g. "Due or overdue wellness follow-ups". */
  label: string;
  resultCount: number;
  /** Route back to the unfiltered view. */
  clearHref: string;
  clearLabel?: string;
}

/**
 * Makes an active filter unmistakable: a labeled banner near the page
 * title/tabs, a visible result count, and an explicit route back to the
 * unfiltered view — never a single faint sentence of helper text, and never
 * dependent on the user reading the URL.
 */
export function FilterBanner({
  label,
  resultCount,
  clearHref,
  clearLabel = "View all",
}: FilterBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-border bg-blue-pale px-5 py-4">
      <div>
        <p className="font-sans text-label font-semibold uppercase tracking-wide text-blue">
          Filtered View
        </p>
        <p className="mt-1 font-sans text-base text-body">
          {label}
          {" — "}
          <span className="font-semibold">{resultCount}</span>{" "}
          {resultCount === 1 ? "result" : "results"}
        </p>
      </div>
      <Link
        href={clearHref}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-blue-border bg-surface px-4 font-sans text-button font-medium text-blue transition-colors hover:bg-white"
      >
        {clearLabel}
      </Link>
    </div>
  );
}
