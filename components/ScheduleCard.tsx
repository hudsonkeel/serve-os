/* Static class strings — required for Tailwind's scanner to include these at build time */
const serviceClasses: Record<string, { ring: string; dot: string }> = {
  "Personal Care":    { ring: "bg-gold/8",          dot: "bg-gold" },
  "Companionship":    { ring: "bg-[#6B92AE]/8",     dot: "bg-[#6B92AE]" },
  "Specialized Care": { ring: "bg-[#6D8C73]/8",     dot: "bg-[#6D8C73]" },
  "Concierge":        { ring: "bg-[#9B75A0]/8",     dot: "bg-[#9B75A0]" },
};

const statusClasses: Record<string, { badge: string; label: string }> = {
  active:   { badge: "bg-gold/12 text-gold-dark",      label: "Active" },
  upcoming: { badge: "bg-navy/6 text-body",             label: "Upcoming" },
  complete: { badge: "bg-[#6D8C73]/10 text-[#5A8060]", label: "Complete" },
};

interface ScheduleCardProps {
  time: string;
  client: string;
  service: string;
  caregiver: string;
  location: string;
  status?: "active" | "upcoming" | "complete";
}

export function ScheduleCard({
  time,
  client,
  service,
  caregiver,
  location,
  status = "upcoming",
}: ScheduleCardProps) {
  const [hour, period] = time.split(" ");
  const svc = serviceClasses[service] ?? serviceClasses["Personal Care"];
  const st = statusClasses[status];

  return (
    <div className="flex items-center gap-5 rounded-xl bg-white px-6 py-4 shadow-card transition-all duration-150 hover:-translate-y-px">
      {/* Time */}
      <div className="w-14 shrink-0 text-right">
        <p className="font-sans text-sm font-medium text-navy">{hour}</p>
        <p className="font-sans text-[10px] uppercase tracking-wider text-muted">{period}</p>
      </div>

      {/* Divider */}
      <div className="h-9 w-px shrink-0 bg-gold/25" />

      {/* Service indicator */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${svc.ring}`}>
        <div className={`h-2 w-2 rounded-full ${svc.dot}`} />
      </div>

      {/* Client info */}
      <div className="min-w-0 flex-1">
        <p className="font-serif text-base font-medium leading-tight text-navy">{client}</p>
        <p className="mt-0.5 font-sans text-xs text-muted">
          {service} &middot; {location}
        </p>
      </div>

      {/* Caregiver + status */}
      <div className="shrink-0 text-right">
        <p className="font-sans text-xs font-medium text-body">{caregiver}</p>
        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[10px] font-medium ${st.badge}`}>
          {st.label}
        </span>
      </div>
    </div>
  );
}
