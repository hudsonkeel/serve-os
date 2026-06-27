import { ProspectStatus } from "@/lib/supabase/types";

export type FilterValue = "all" | ProspectStatus;

const FILTER_ORDER: FilterValue[] = [
  "all",
  "new",
  "reviewing",
  "contacted",
  "assessment_scheduled",
  "converted",
  "closed",
];

const FILTER_LABELS: Record<FilterValue, string> = {
  all: "All",
  new: "New",
  reviewing: "Reviewing",
  contacted: "Contacted",
  assessment_scheduled: "Assessment Scheduled",
  converted: "Converted",
  closed: "Closed",
};

interface StatusFilterProps {
  active: FilterValue;
  counts: Partial<Record<FilterValue, number>>;
  onSelect: (value: FilterValue) => void;
}

export function StatusFilter({ active, counts, onSelect }: StatusFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTER_ORDER.map((value) => {
        const isActive = active === value;
        const count = counts[value] ?? 0;

        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-xs font-medium transition-colors ${
              isActive
                ? "bg-navy text-white"
                : "border border-ivory-border bg-white text-muted hover:border-navy/20 hover:text-body"
            }`}
          >
            {FILTER_LABELS[value]}
            <span
              className={`min-w-[1.25rem] rounded-full px-1 py-0.5 text-center text-[10px] font-semibold leading-none ${
                isActive ? "bg-white/20 text-white" : "bg-ivory-warm text-muted"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
