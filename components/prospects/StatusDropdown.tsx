"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProspectStatus } from "@/lib/supabase/types";
import { updateProspectStatus } from "@/lib/actions/prospects";

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "contacted", label: "Contacted" },
  { value: "assessment_scheduled", label: "Assessment Scheduled" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
];

interface StatusDropdownProps {
  id: string;
  status: ProspectStatus;
}

export function StatusDropdown({ id, status }: StatusDropdownProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as ProspectStatus;
    startTransition(async () => {
      await updateProspectStatus(id, next);
      router.refresh();
    });
  };

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={isPending}
      className="rounded-md border border-ivory-border bg-white px-3 py-1.5 font-sans text-xs text-body shadow-sm transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold/40"
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
