import { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";

interface MemorySectionHeaderProps {
  title: string;
  functionalLabel: string;
  purpose: string;
  belongsHere?: string[];
  doesNotBelongHere?: string[];
  primaryAction?: ReactNode;
}

// Shared "what is this, what goes here, what do I do" header for each
// Resident Memory layer (Current Needs, Working Notes, Timeline) — every
// data-entry surface in that container explains itself the same way, so
// the user learns the pattern once and it repeats. See
// docs/design/RESIDENT_MEMORY.md.
export function MemorySectionHeader({
  title,
  functionalLabel,
  purpose,
  belongsHere,
  doesNotBelongHere,
  primaryAction,
}: MemorySectionHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
            {title}
          </h4>
          <Badge tone="gold">{functionalLabel}</Badge>
        </div>
        {primaryAction}
      </div>
      <p className="mt-1 max-w-2xl font-sans text-sm text-subtle">{purpose}</p>
      {belongsHere && belongsHere.length > 0 && (
        <p className="mt-2 max-w-2xl font-sans text-sm text-subtle">
          <span className="font-semibold text-muted">Belongs here: </span>
          {belongsHere.join(" · ")}
        </p>
      )}
      {doesNotBelongHere && doesNotBelongHere.length > 0 && (
        <p className="mt-1 max-w-2xl font-sans text-sm text-subtle">
          <span className="font-semibold text-muted">Not here: </span>
          {doesNotBelongHere.join(" · ")}
        </p>
      )}
    </div>
  );
}
