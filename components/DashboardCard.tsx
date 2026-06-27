interface DashboardCardProps {
  label: string;
  value: string | number;
  description?: string;
  accent?: boolean;
}

export function DashboardCard({ label, value, description, accent }: DashboardCardProps) {
  return (
    <div
      className={`rounded-xl bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-px border-t-2 ${
        accent ? "border-t-gold" : "border-t-transparent"
      }`}
    >
      <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold">
        {label}
      </p>
      <p className="mt-3 font-serif text-[2.75rem] font-light leading-none text-navy">
        {value}
      </p>
      {description && (
        <p className="mt-2 font-sans text-xs text-muted">{description}</p>
      )}
    </div>
  );
}
