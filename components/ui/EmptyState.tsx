interface EmptyStateProps {
  title?: string;
  description: string;
}

/** Shared empty-state block — readable at body-text size, never a single faint line. */
export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-ivory-border bg-ivory px-5 py-8 text-center">
      {title && (
        <p className="font-serif text-card-title font-light text-body">{title}</p>
      )}
      <p className={`font-sans text-base text-muted ${title ? "mt-1.5" : ""}`}>
        {description}
      </p>
    </div>
  );
}
