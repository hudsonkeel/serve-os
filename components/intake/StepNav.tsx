interface StepNavProps {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  showBack?: boolean;
  submitting?: boolean;
}

export function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  showBack = true,
  submitting = false,
}: StepNavProps) {
  return (
    <div className="mt-8 flex items-center justify-between gap-4">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="font-sans text-sm text-muted transition-colors hover:text-body disabled:opacity-40"
        >
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={submitting}
        className="rounded-lg bg-gold px-7 py-3 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-gold-dark hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting…" : nextLabel}
      </button>
    </div>
  );
}
