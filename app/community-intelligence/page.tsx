import { PageContainer } from "@/components/PageContainer";

const insights = [
  {
    category: "Vulnerability",
    metrics: [
      { label: "Residents Living Alone",          value: "34", description: "No regular family visitor logged" },
      { label: "Residents Without Local Family",   value: "12", description: "Family contact outside DFW" },
      { label: "Residents Over Age 90",            value: "8",  description: "May benefit from additional check-ins" },
    ],
  },
  {
    category: "Outreach Opportunities",
    metrics: [
      { label: "Birthdays This Month",             value: "7",  description: "Opportunity to connect and celebrate" },
      { label: "Potential Wellness Outreach",      value: "14", description: "No contact in 30+ days" },
      { label: "Potential Transportation Needs",   value: "9",  description: "Residents with upcoming appointments" },
      { label: "Potential Companion Visits",       value: "22", description: "Residents flagged for social isolation" },
    ],
  },
  {
    category: "Pipeline",
    metrics: [
      { label: "Pending Assessments",              value: "3",  description: "Scheduled or overdue" },
      { label: "Families Awaiting Proposal",       value: "2",  description: "Assessment complete, proposal pending" },
      { label: "Active Prospect Conversations",    value: "8",  description: "In the intake pipeline" },
    ],
  },
];

export default function CommunityIntelligencePage() {
  return (
    <PageContainer title="Community Intelligence">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-light text-navy">Community Intelligence</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Operational insights across your community — powered by relationship data
        </p>
      </div>

      {/* Coming soon banner */}
      <div className="mb-8 rounded-xl border border-gold/30 bg-gold/5 px-6 py-4">
        <p className="font-sans text-sm font-medium text-gold-dark">
          AI-powered insights coming soon
        </p>
        <p className="mt-1 font-sans text-xs text-muted">
          These metrics are currently illustrative. When Ask Serve AI is active, this page will
          surface real-time insights derived from resident records, interaction history, and
          community data.
        </p>
      </div>

      {/* Insight categories */}
      <div className="space-y-8">
        {insights.map((group) => (
          <div key={group.category}>
            <h2 className="mb-4 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              {group.category}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-ivory-border bg-white p-6 shadow-card"
                >
                  <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold">
                    {metric.label}
                  </p>
                  <p className="mt-3 font-serif text-[2.75rem] font-light leading-none text-navy">
                    {metric.value}
                  </p>
                  <p className="mt-2 font-sans text-xs text-muted">{metric.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
