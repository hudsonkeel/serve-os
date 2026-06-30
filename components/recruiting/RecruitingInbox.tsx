"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { RecruitingLead, RecruitingLeadStatus } from "@/lib/supabase/types";
import { RecruitingStatusBadge } from "./RecruitingStatusBadge";
import { RecruitingWorkflowActions } from "./RecruitingWorkflowActions";

type FilterValue = "all" | RecruitingLeadStatus;

const FILTER_ORDER: FilterValue[] = [
  "all",
  "new",
  "contacted",
  "in_review",
  "applied",
  "not_a_fit",
  "hired",
  "archived",
];

const FILTER_LABELS: Record<FilterValue, string> = {
  all:       "All",
  new:       "New",
  contacted: "Contacted",
  in_review: "In Review",
  applied:   "Applied",
  not_a_fit: "Not a Fit",
  hired:     "Hired",
  archived:  "Archived",
};

const ROLE_LABELS: Record<string, string> = {
  caregiver:         "Caregiver",
  managing_director: "Managing Director",
};

const HEADERS = [
  "Name",
  "Phone",
  "Email",
  "Location",
  "Status",
  "Apploi",
  "Actions",
  "Received",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function RecruitingRow({ lead }: { lead: RecruitingLead }) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
  const location = lead.zip_code ?? lead.city_state ?? "—";

  const apploiCell =
    lead.role_interest === "caregiver" ? (
      lead.apploi_redirected_at ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Minus className="h-3.5 w-3.5 text-subtle" />
      )
    ) : (
      <span className="font-sans text-xs text-subtle">N/A</span>
    );

  return (
    <div className="recruiting-inbox-grid grid items-center gap-x-4 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate font-sans text-sm font-medium text-body">{name}</p>
        <p className="mt-0.5 font-sans text-xs text-muted">
          {ROLE_LABELS[lead.role_interest] ?? lead.role_interest}
        </p>
      </div>
      <p className="font-sans text-xs text-body">{lead.phone ?? "—"}</p>
      <p className="truncate font-sans text-xs text-body">{lead.email ?? "—"}</p>
      <p className="font-sans text-xs text-body">{location}</p>
      <div>
        <RecruitingStatusBadge status={lead.status} />
      </div>
      <div className="flex items-center">{apploiCell}</div>
      <div>
        <RecruitingWorkflowActions id={lead.id} currentStatus={lead.status} />
      </div>
      <p className="font-sans text-xs text-muted">{formatDate(lead.created_at)}</p>
    </div>
  );
}

export function RecruitingInbox({ leads }: { leads: RecruitingLead[] }) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");

  const counts = leads.reduce<Partial<Record<FilterValue, number>>>((acc, l) => {
    acc.all = (acc.all ?? 0) + 1;
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  const visible =
    activeFilter === "all" ? leads : leads.filter((l) => l.status === activeFilter);

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_ORDER.map((value) => {
          const isActive = activeFilter === value;
          const count = counts[value] ?? 0;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveFilter(value)}
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

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-ivory-border bg-white shadow-card">
        {/* Column headers */}
        <div className="recruiting-inbox-grid grid min-w-max items-center gap-x-4 rounded-t-xl border-b border-ivory-border bg-ivory-warm px-5 py-2.5">
          {HEADERS.map((h, i) => (
            <span
              key={i}
              className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted"
            >
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {visible.length > 0 ? (
          <div className="min-w-max divide-y divide-ivory-border">
            {visible.map((lead) => (
              <RecruitingRow key={lead.id} lead={lead} />
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="font-sans text-sm text-muted">No leads with this status.</p>
          </div>
        )}
      </div>
    </div>
  );
}
