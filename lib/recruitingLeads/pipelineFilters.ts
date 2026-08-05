import type { RecruitingLead, RecruitingLeadStatus } from "@/lib/supabase/types";

export type RecruitingPipelineFilter = "all" | RecruitingLeadStatus;

// A recruiting lead has resolved — positively (hired) or otherwise
// (not a fit, archived) — and is no longer active pipeline work. See
// docs/architecture/HIRING_PIPELINE_AUDIT.md and
// docs/architecture/RECRUITING_WORKFORCE_RECONCILIATION.md ("a hired
// person should not appear in Active Pipeline").
const TERMINAL_STATUSES: ReadonlySet<RecruitingLeadStatus> = new Set(["archived", "hired", "not_a_fit"]);

// "all" means Active Pipeline (see FILTER_LABELS in RecruitingInbox.tsx),
// not literally every row — terminal-status records are excluded from
// both the default list and its count so a resolved candidate never
// inflates what looks like active pipeline volume. Every terminal status
// remains fully visible and countable via its own explicit tab.
export function filterRecruitingLeadsForPipeline(
  leads: readonly RecruitingLead[],
  filter: RecruitingPipelineFilter
): RecruitingLead[] {
  if (filter === "all") {
    return leads.filter((lead) => !TERMINAL_STATUSES.has(lead.status));
  }
  return leads.filter((lead) => lead.status === filter);
}

export function countRecruitingLeadsByFilter(
  leads: readonly RecruitingLead[]
): Partial<Record<RecruitingPipelineFilter, number>> {
  return leads.reduce<Partial<Record<RecruitingPipelineFilter, number>>>((acc, lead) => {
    if (!TERMINAL_STATUSES.has(lead.status)) {
      acc.all = (acc.all ?? 0) + 1;
    }
    acc[lead.status] = (acc[lead.status] ?? 0) + 1;
    return acc;
  }, {});
}
