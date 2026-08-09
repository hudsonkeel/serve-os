import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { COMMUNITY_OUTLOOK_CONTEXT } from "@/lib/askServe/areaContexts";

// Community Intelligence is proactive, system-initiated pattern-surfacing —
// distinct from Ask Serve's user-initiated, on-demand reasoning. See
// docs/architecture/SERVE_OS_OPERATING_MODEL.md. Metrics below are
// illustrative until each intelligence engine is connected to real data; no
// insight here is manufactured from data Serve OS doesn't actually have.
const insightCategories = [
  {
    category: "Resident Wellness",
    status: "illustrative" as const,
    metrics: [
      { label: "Residents Living Alone",          value: "34", description: "No regular family visitor logged" },
      { label: "Residents Without Local Family",   value: "12", description: "Family contact outside DFW" },
      { label: "Residents Over Age 90",            value: "8",  description: "May benefit from additional check-ins" },
    ],
  },
  {
    category: "Relationship Intelligence",
    status: "illustrative" as const,
    metrics: [
      { label: "Birthdays This Month",             value: "7",  description: "Opportunity to connect and celebrate" },
      { label: "Potential Wellness Outreach",      value: "14", description: "No contact in 30+ days" },
      { label: "Potential Transportation Needs",   value: "9",  description: "Residents with upcoming appointments" },
      { label: "Potential Companion Visits",       value: "22", description: "Residents flagged for social isolation" },
    ],
  },
  {
    category: "Scheduling Intelligence",
    status: "not_connected" as const,
    description:
      "Recurring lateness, visit-duration variance, coverage stability, routing efficiency, and unused capacity will appear here once scheduling data is connected.",
  },
  {
    category: "Operational Best Practices",
    status: "illustrative" as const,
    metrics: [
      { label: "Pending Assessments",              value: "3",  description: "Scheduled or overdue" },
      { label: "Families Awaiting Proposal",       value: "2",  description: "Assessment complete, proposal pending" },
      { label: "Active Prospect Conversations",    value: "8",  description: "In the intake pipeline" },
    ],
  },
  {
    category: "Quality / Compliance",
    status: "not_connected" as const,
    description:
      "Upcoming reassessment deadlines, care-plan review risk, recurring missed tasks, and audit-readiness concerns will appear here once compliance tracking is connected.",
  },
];

export default async function CommunityIntelligencePage() {
  const profile = await getCurrentAuthorizedUser();
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  return (
    <PageContainer title="Community Outlook">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Community Outlook</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Proactive patterns, risks, opportunities, and operational insights across the
            community.
          </p>
        </div>
        {askServeEnabled && (
          <AskServeTrigger
            context={buildAskServeContext(COMMUNITY_OUTLOOK_CONTEXT, { userRole: profile?.role ?? undefined })}
            label="Ask Serve about this community"
          />
        )}
      </div>

      <div className="mb-8 rounded-xl border border-gold/30 bg-gold/5 px-6 py-4">
        <p className="font-sans text-sm font-medium text-gold-dark">
          Community Intelligence surfaces patterns automatically — Ask Serve answers
          questions on demand
        </p>
        <p className="mt-1 font-sans text-sm text-muted">
          The metrics below are currently illustrative. As each intelligence engine connects
          to live data, this page will surface real patterns across resident wellness,
          relationships, scheduling, operations, and compliance without anyone first asking.
        </p>
      </div>

      <div className="space-y-8">
        {insightCategories.map((group) => (
          <div key={group.category}>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
                {group.category}
              </h2>
              {group.status === "illustrative" ? (
                <Badge tone="neutral">Illustrative</Badge>
              ) : (
                <Badge tone="neutral">Not Yet Connected</Badge>
              )}
            </div>

            {group.status === "illustrative" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card"
                  >
                    <p className="font-sans text-label font-semibold uppercase tracking-[0.14em] text-gold-dark">
                      {metric.label}
                    </p>
                    <p className="mt-3 font-serif text-metric font-semibold leading-none tracking-tight text-body">
                      {metric.value}
                    </p>
                    <p className="mt-2 font-sans text-sm text-muted">{metric.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState description={group.description} />
            )}
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
