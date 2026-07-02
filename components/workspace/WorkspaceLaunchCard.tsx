import Link from "next/link";
import { LucideIcon } from "lucide-react";

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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10">
          <Icon size={16} strokeWidth={1.5} className="text-gold" />
        </div>
        <div className="min-w-0">
          <h3 className="font-sans text-sm font-semibold text-navy">{title}</h3>
          <p className="mt-1 font-sans text-xs leading-relaxed text-muted">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-3">
        <p className="w-full border-t border-ivory-border pt-3 text-center font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
          Powered by {poweredBy}
        </p>
      </div>
    </>
  );

  const className = `group flex h-full flex-col rounded-lg border bg-white p-5 shadow-card outline-none transition-all duration-150 ${
    disabled
      ? "cursor-default border-ivory-border opacity-70"
      : "cursor-pointer border-ivory-border hover:-translate-y-px hover:border-navy/20 hover:bg-white hover:shadow-card-hover focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/30"
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
