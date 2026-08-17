import Link from "next/link";

// The permanent top-of-dashboard domain card — one per Audit Readiness
// domain (Workforce today; Emergency Preparedness and Client Readiness
// render in this same slot, in this same position, the moment they're
// configured — no dashboard redesign needed then, just this card's
// `configured` branch starting to receive real numbers). An unconfigured
// domain shows a restrained "Coming Soon" state — never a fabricated
// percentage, count, or zero.
export function DomainReadinessCard({
  label,
  configured,
  readySubjectCount,
  subjectCount,
  requirementSatisfiedCount,
  requirementApplicableCount,
  requirementDetailHref,
  explanation,
  metricType = "people",
  subjectNoun = "employee",
}: {
  label: string;
  configured: boolean;
  readySubjectCount: number;
  subjectCount: number;
  requirementSatisfiedCount: number;
  requirementApplicableCount: number;
  requirementDetailHref: string;
  // Explains this domain's own two metrics — lives inside the card it
  // describes, not spanning beneath all three (each domain's metrics mean
  // something slightly different, so the explanation belongs with its own
  // card, not shared).
  explanation?: string;
  // "people" (default) is Workforce's existing two-metric shape, byte-for-
  // byte unchanged. "requirements" is for agency-level domains with no
  // separate people-metric to distinguish from Requirement Completion
  // (Emergency Preparedness has exactly one subject — the agency itself) —
  // renders one metric block instead of two.
  metricType?: "people" | "requirements";
  // The singular noun for one subject in the "people" metric sentence —
  // "employee" (default, Workforce's existing wording, unchanged) or
  // "client" (Client Readiness — its subjects are residents, never
  // "employees"). Pluralized with a trailing "s"; every noun this domain
  // currently uses ("employee") already pluralizes that way.
  subjectNoun?: string;
}) {
  const title = label.endsWith("Readiness") ? label : `${label} Readiness`;

  if (!configured) {
    return (
      <div className="rounded-xl border border-ivory-border bg-white p-5">
        <p className="font-sans text-sm font-semibold text-body">{title}</p>
        <p className="mt-2 font-sans text-sm text-subtle">Coming Soon — Not Yet Configured</p>
      </div>
    );
  }

  const requirementPct =
    requirementApplicableCount === 0 ? 0 : Math.round((requirementSatisfiedCount / requirementApplicableCount) * 100);
  const requirementsNeedingAttention = requirementApplicableCount - requirementSatisfiedCount;

  if (metricType === "requirements") {
    return (
      <div className="rounded-xl border border-ivory-border bg-white p-5">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">
          Current {label} Readiness — {requirementPct}%
        </p>
        <p className="mt-1 font-serif text-xl font-light text-body">
          <span className="font-semibold text-success-text">{requirementSatisfiedCount}</span> of{" "}
          {requirementApplicableCount} applicable requirements satisfied
        </p>
        <p className="mt-0.5 font-sans text-sm text-muted">
          <span className="font-semibold text-danger-text">{requirementsNeedingAttention}</span> requirement
          {requirementsNeedingAttention === 1 ? "" : "s"} need{requirementsNeedingAttention === 1 ? "s" : ""} attention
        </p>

        <div className="mt-4 border-t border-ivory-border pt-3">
          <Link href={requirementDetailHref} className="inline-block font-sans text-xs font-medium text-navy hover:text-navy-light">
            View by requirement →
          </Link>
        </div>

        {explanation && <p className="mt-4 font-sans text-xs text-subtle">{explanation}</p>}
      </div>
    );
  }

  const readyPct = subjectCount === 0 ? 0 : Math.round((readySubjectCount / subjectCount) * 100);
  const needAttention = subjectCount - readySubjectCount;

  return (
    <div className="rounded-xl border border-ivory-border bg-white p-5">
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">
        Current {label} Readiness — {readyPct}%
      </p>
      <p className="mt-1 font-serif text-xl font-light text-body">
        <span className="font-semibold text-success-text">{readySubjectCount}</span> of {subjectCount} {subjectNoun}s
        fully audit-ready
      </p>
      <p className="mt-0.5 font-sans text-sm text-muted">
        <span className="font-semibold text-danger-text">{needAttention}</span> {subjectNoun}{needAttention === 1 ? "" : "s"}{" "}
        need{needAttention === 1 ? "s" : ""} attention
      </p>

      <div className="mt-4 border-t border-ivory-border pt-3">
        <p className="font-sans text-xs font-medium text-subtle">Requirement Completion — {requirementPct}%</p>
        <p className="mt-0.5 font-sans text-sm text-muted">
          {requirementSatisfiedCount} of {requirementApplicableCount} requirements satisfied
        </p>
        <Link href={requirementDetailHref} className="mt-2 inline-block font-sans text-xs font-medium text-navy hover:text-navy-light">
          View by requirement →
        </Link>
      </div>

      {explanation && <p className="mt-4 font-sans text-xs text-subtle">{explanation}</p>}
    </div>
  );
}
