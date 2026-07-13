import Link from "next/link";

interface DashboardCardProps {
  label: string;
  value: string | number;
  description?: string;
  accent?: boolean;
  // Awareness metrics may open a filtered management view for investigation
  // (e.g. "Active Prospects" -> Residents filtered to prospects). This must
  // never point at a creation workflow — that belongs in Workspace.
  href?: string;
}

export function DashboardCard({ label, value, description, accent, href }: DashboardCardProps) {
  const className = `rounded-xl border border-ivory-border bg-surface p-6 shadow-card transition-all duration-200 hover:-translate-y-px border-t-2 ${
    accent ? "border-t-gold" : "border-t-ivory-border"
  } ${href ? "hover:border-navy/20 hover:shadow-card-hover" : ""}`;

  const content = (
    <>
      <p className="font-sans text-label font-semibold uppercase tracking-[0.14em] text-gold-dark">
        {label}
      </p>
      <p className="mt-3 font-serif text-metric font-semibold leading-none tracking-tight text-body">
        {value}
      </p>
      {description && (
        <p className="mt-2 font-sans text-sm text-muted">{description}</p>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
