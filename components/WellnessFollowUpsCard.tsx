import Link from "next/link";

interface WellnessFollowUpsCardProps {
  dueOrOverdue: number;
  dueThisWeek: number;
}

export function WellnessFollowUpsCard({
  dueOrOverdue,
  dueThisWeek,
}: WellnessFollowUpsCardProps) {
  return (
    <div className="rounded-xl border border-ivory-border border-t-2 border-t-gold bg-surface p-6 shadow-card transition-all duration-200 hover:-translate-y-px">
      <p className="font-sans text-label font-semibold uppercase tracking-[0.14em] text-gold-dark">
        Wellness Follow-ups
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/residents?tab=wellness_watch&wellnessDue=now"
          className="group flex min-h-[64px] flex-col justify-center rounded-lg px-2 py-1 transition-colors hover:bg-ivory"
        >
          <p className="font-serif text-4xl font-semibold leading-none tracking-tight text-body transition-colors group-hover:text-gold-dark">
            {dueOrOverdue}
          </p>
          <p className="mt-1.5 font-sans text-sm text-muted">Due / Overdue</p>
        </Link>
        <Link
          href="/residents?tab=wellness_watch&wellnessDue=week"
          className="group flex min-h-[64px] flex-col justify-center rounded-lg px-2 py-1 transition-colors hover:bg-ivory"
        >
          <p className="font-serif text-4xl font-semibold leading-none tracking-tight text-body transition-colors group-hover:text-gold-dark">
            {dueThisWeek}
          </p>
          <p className="mt-1.5 font-sans text-sm text-muted">Due This Week</p>
        </Link>
      </div>
    </div>
  );
}
