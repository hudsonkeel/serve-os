import { RecruitingLeadStatus } from "@/lib/supabase/types";

const STATUS_CONFIG: Record<RecruitingLeadStatus, { label: string; className: string }> = {
  new:       { label: "New",        className: "bg-blue-100 text-blue-700" },
  contacted: { label: "Contacted",  className: "bg-amber-100 text-amber-700" },
  in_review: { label: "In Review",  className: "bg-indigo-100 text-indigo-700" },
  applied:   { label: "Applied",    className: "bg-teal-100 text-teal-700" },
  not_a_fit: { label: "Not a Fit",  className: "bg-red-100 text-red-600" },
  hired:     { label: "Hired",      className: "bg-emerald-100 text-emerald-700" },
  archived:  { label: "Archived",   className: "bg-gray-100 text-gray-500" },
};

export function RecruitingStatusBadge({ status }: { status: RecruitingLeadStatus }) {
  const { label, className } = STATUS_CONFIG[status] ?? {
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
