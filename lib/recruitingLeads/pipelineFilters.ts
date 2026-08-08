import type { RecruitingLeadStatus } from "@/lib/supabase/types";
import type { EnrichedRecruitingLead } from "@/lib/data/recruitingLeads";

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
//
// Filters on effectiveStatus, never the raw stored lead.status — a
// recruiting lead confirmed-linked to an active workforce member is
// effectively "hired" regardless of what its stored status still says
// (see lib/recruitingLeads/pipelineStatus.ts). This is what keeps a
// hired person out of Active Pipeline even if the one-time status write
// that should have happened at hire time never did.
export function filterRecruitingLeadsForPipeline(
  leads: readonly EnrichedRecruitingLead[],
  filter: RecruitingPipelineFilter
): EnrichedRecruitingLead[] {
  if (filter === "all") {
    return leads.filter((entry) => !TERMINAL_STATUSES.has(entry.effectiveStatus));
  }
  return leads.filter((entry) => entry.effectiveStatus === filter);
}

export function countRecruitingLeadsByFilter(
  leads: readonly EnrichedRecruitingLead[]
): Partial<Record<RecruitingPipelineFilter, number>> {
  return leads.reduce<Partial<Record<RecruitingPipelineFilter, number>>>((acc, entry) => {
    if (!TERMINAL_STATUSES.has(entry.effectiveStatus)) {
      acc.all = (acc.all ?? 0) + 1;
    }
    acc[entry.effectiveStatus] = (acc[entry.effectiveStatus] ?? 0) + 1;
    return acc;
  }, {});
}
