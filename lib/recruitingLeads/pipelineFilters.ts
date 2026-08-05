import type { RecruitingLead, RecruitingLeadStatus } from "@/lib/supabase/types";

export type RecruitingPipelineFilter = "all" | RecruitingLeadStatus;

// "All" means the operational pipeline, not literally every row —
// archived records are deliberately excluded from both the default list
// and its count so a stale/test candidate never inflates what looks like
// real pipeline volume. See docs/architecture/HIRING_PIPELINE_AUDIT.md.
export function filterRecruitingLeadsForPipeline(
  leads: readonly RecruitingLead[],
  filter: RecruitingPipelineFilter
): RecruitingLead[] {
  if (filter === "all") {
    return leads.filter((lead) => lead.status !== "archived");
  }
  return leads.filter((lead) => lead.status === filter);
}

export function countRecruitingLeadsByFilter(
  leads: readonly RecruitingLead[]
): Partial<Record<RecruitingPipelineFilter, number>> {
  return leads.reduce<Partial<Record<RecruitingPipelineFilter, number>>>((acc, lead) => {
    if (lead.status !== "archived") {
      acc.all = (acc.all ?? 0) + 1;
    }
    acc[lead.status] = (acc[lead.status] ?? 0) + 1;
    return acc;
  }, {});
}
