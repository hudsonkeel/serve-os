import { ArrowRight } from "lucide-react";

interface RoleCardProps {
  role: string;
  tagline: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}

export function RoleCard({
  role,
  tagline,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: RoleCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-ivory-border bg-white p-7 shadow-card">
      <div>
        <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark">
          {role}
        </p>
        <h2 className="mt-2 font-serif text-2xl font-light text-navy">
          {tagline}
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-body">
          {description}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <a
          href={primaryHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-5 py-3 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-navy-light hover:shadow-md"
        >
          {primaryLabel}
          <ArrowRight className="h-4 w-4" />
        </a>
        <a
          href={secondaryHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-ivory-border bg-ivory px-5 py-2.5 font-sans text-sm text-muted transition-colors hover:border-gold/50 hover:text-navy"
        >
          {secondaryLabel}
        </a>
      </div>
    </div>
  );
}
