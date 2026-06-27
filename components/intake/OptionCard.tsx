interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}

export function OptionCard({ label, description, selected, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-150 ${
        selected
          ? "border-gold bg-gold-subtle"
          : "border-ivory-border bg-white hover:border-gold/40 hover:bg-ivory"
      }`}
    >
      <span
        className={`block font-sans text-sm font-medium ${
          selected ? "text-navy" : "text-body"
        }`}
      >
        {label}
      </span>
      {description && (
        <span
          className={`mt-0.5 block font-sans text-xs ${
            selected ? "text-navy/60" : "text-muted"
          }`}
        >
          {description}
        </span>
      )}
    </button>
  );
}
