// The recruiting pipeline should represent pre-workforce hiring
// activity, not remain an independent competing truth after someone
// has been hired — see docs/architecture/RECRUITING_WORKFORCE_RECONCILIATION.md
// and docs/architecture/HIRING_PIPELINE_AUDIT.md.
//
// This is a pure projection, the same discipline used throughout
// Serve OS's People We Serve model
// (lib/residents/serveRelationshipProjection.ts): the stored
// recruiting_leads.status is never silently overwritten by this
// function — it stays as history. The EFFECTIVE status treats a
// confirmed, structural link to an actively-employed workforce member
// as a higher-precedence fact than a stale stored status, so a
// recruiting record cannot keep showing "In Review" (or any other
// non-terminal status) once the same person is a confirmed, active
// workforce member — even if the one-time status write that should
// have happened at confirmation time never did, or later drifts.
import type { RecruitingLeadStatus } from "@/lib/supabase/types";
import type { WorkforceLifecycleStatus } from "@/lib/workforce/lifecycleStatus";

// Terminal statuses already represent a settled human decision
// (hired/archived/not_a_fit) — never overridden here, even if a
// workforce link is also present, so an explicit "not a fit" or
// "archived" call is never silently second-guessed by this
// projection. Matches lib/recruitingLeads/pipelineFilters.ts's own
// TERMINAL_STATUSES set.
const NON_TERMINAL_STATUSES: ReadonlySet<RecruitingLeadStatus> = new Set(["new", "contacted", "in_review", "applied"]);

export interface EffectiveRecruitingStatusResult {
  readonly effectiveStatus: RecruitingLeadStatus;
  // True only when this projection is the reason the effective status
  // differs from the stored one — lets the UI make the "Workforce
  // supersedes Recruiting" fact obvious rather than requiring the
  // operator to already know it.
  readonly isDerivedFromWorkforceLink: boolean;
}

export function deriveEffectiveRecruitingStatus(
  storedStatus: RecruitingLeadStatus,
  linkedWorkforceLifecycleStatus: WorkforceLifecycleStatus | null
): EffectiveRecruitingStatusResult {
  if (linkedWorkforceLifecycleStatus === "active" && NON_TERMINAL_STATUSES.has(storedStatus)) {
    return { effectiveStatus: "hired", isDerivedFromWorkforceLink: true };
  }
  return { effectiveStatus: storedStatus, isDerivedFromWorkforceLink: false };
}
