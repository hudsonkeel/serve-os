// Native <details>/<summary> — zero JS, works without hydration, fully
// accessible by default. Used for Layer 7 (Record & History): technical/
// source detail that must stay reachable for auditability but shouldn't
// compete visually with the primary work surface above it.
export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-ivory-border bg-surface shadow-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 select-none">
        <div>
          <span className="font-sans text-label font-semibold uppercase tracking-widest text-muted">{title}</span>
          {description && <p className="mt-0.5 font-sans text-xs text-subtle">{description}</p>}
        </div>
        <span className="shrink-0 font-sans text-sm text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-6 border-t border-ivory-border p-6">{children}</div>
    </details>
  );
}
