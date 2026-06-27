import { ProspectStatus } from "@/lib/supabase/types";

const STATUS_CONFIG: Record<
  ProspectStatus,
  { label: string; className: string }
> = {
  new: {
    label: "New",
    className: "bg-blue-100 text-blue-700",
  },
  reviewing: {
    label: "Reviewing",
    className: "bg-amber-100 text-amber-700",
  },
  contacted: {
    label: "Contacted",
    className: "bg-purple-100 text-purple-700",
  },
  assessment_scheduled: {
    label: "Assessment",
    className: "bg-indigo-100 text-indigo-700",
  },
  converted: {
    label: "Converted",
    className: "bg-green-100 text-green-700",
  },
  closed: {
    label: "Closed",
    className: "bg-gray-100 text-gray-500",
  },
};

export function StatusBadge({ status }: { status: ProspectStatus }) {
  const { label, className } =
    STATUS_CONFIG[status] ?? {
      label: status,
      className: "bg-gray-100 text-gray-500",
    };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium ${className}`}
    >
      {label}
    </span>
  );
}
