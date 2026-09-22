import type { SupportStatus } from "@/lib/askServe/answer/types";

const STATUS_CONFIG: Record<SupportStatus, { label: string; className: string }> = {
  supported: { label: "Supported by Serve evidence", className: "bg-emerald-100 text-emerald-700" },
  partially_supported: { label: "Partially supported", className: "bg-amber-100 text-amber-700" },
  needs_review: { label: "Needs review", className: "bg-red-100 text-red-600" },
  not_found: { label: "Not found in Serve evidence", className: "bg-gray-100 text-gray-500" },
};

export function AskServeSupportBadge({ status }: { status: SupportStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}
