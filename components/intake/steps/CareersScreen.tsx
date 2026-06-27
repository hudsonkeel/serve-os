interface CareersScreenProps {
  onBack: () => void;
}

export function CareersScreen({ onBack }: CareersScreenProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold">
          Join Our Team
        </p>
        <h2 className="mt-2 font-serif text-2xl font-light text-navy">
          Careers at Serve Caregiving
        </h2>
      </div>

      <p className="font-sans text-sm leading-relaxed text-body">
        Thank you for your interest in joining Serve Caregiving. Please continue to our
        current openings to view available roles and apply.
      </p>

      <a
        href="#"
        className="inline-flex items-center gap-2 rounded-lg bg-navy px-6 py-3 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-navy-light hover:shadow-md"
      >
        View Open Positions →
      </a>

      <p className="font-sans text-xs text-muted">
        We use our hiring portal to keep applications organized and ensure every candidate
        is reviewed consistently.
      </p>

      <div className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="font-sans text-sm text-muted transition-colors hover:text-body"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
