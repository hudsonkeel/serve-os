import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface WorkspaceLaunchCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  poweredBy: string;
  href: string;
  external?: boolean;
  disabled?: boolean;
}

export function WorkspaceLaunchCard({
  icon: Icon,
  title,
  description,
  poweredBy,
  href,
  external,
  disabled,
}: WorkspaceLaunchCardProps) {
  const content = (
    <>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold-subtle">
          <Icon size={18} strokeWidth={1.5} className="text-gold-dark" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-sans text-card-title font-semibold text-body">{title}</h3>
            {disabled && <Badge tone="neutral">Coming Soon</Badge>}
          </div>
          <p className="mt-1 font-sans text-sm leading-relaxed text-muted">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-3">
        <p className="w-full border-t border-ivory-border pt-3 text-center font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Powered by {poweredBy}
        </p>
      </div>
    </>
  );

  const className = `group flex h-full min-h-[132px] flex-col rounded-xl border bg-surface p-6 shadow-card outline-none transition-all duration-150 ${
    disabled
      ? "cursor-default border-ivory-border opacity-80"
      : "cursor-pointer border-ivory-border hover:-translate-y-px hover:border-navy/25 hover:shadow-card-hover focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/30"
  }`;

  if (disabled) {
    return (
      <div aria-disabled="true" className={className}>
        {content}
      </div>
    );
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
