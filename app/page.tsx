import { PageContainer } from "@/components/PageContainer";
import { DashboardCard } from "@/components/DashboardCard";
import { WellnessFollowUpsCard } from "@/components/WellnessFollowUpsCard";
import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import { getRecruitingLeads } from "@/lib/data/recruitingLeads";
import { getActiveProspectRelationshipCount } from "@/lib/data/relationships";
import { getIntakeQueueCounts } from "@/lib/data/intakeEngine";
import {
  formatCentralDashboardDate,
  getCentralTimeGreeting,
} from "@/lib/utils/date";
import { buildCurrentUserDisplay } from "@/lib/auth/display";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const [profile, community, recruiting, activeProspectRelationships, intakeQueueCounts] = await Promise.all([
    getCurrentAuthorizedUser(),
    getCommunityMetrics(),
    getRecruitingLeads(),
    getActiveProspectRelationshipCount(),
    getIntakeQueueCounts(),
  ]);
  const currentUser = buildCurrentUserDisplay(profile);
  const { metrics } = community;
  const dashboardDate = formatCentralDashboardDate();
  const greeting = getCentralTimeGreeting();

  const recruitingReviewCount = recruiting.leads.filter((lead) =>
    ["new", "in_review"].includes(lead.status)
  ).length;

  // Community Snapshot: the state of the roster and the relationship funnel.
  const communitySnapshot = [
    { label: "Residents",        value: String(metrics.totalResidents),   description: community.communityName, accent: true, href: "/residents" },
    { label: "Serve Clients",    value: String(metrics.serveClients),     description: "Active Serve relationships",         href: "/residents?tab=active_clients" },
    { label: "Active Prospects", value: String(activeProspectRelationships), description: "Resident & external prospect Relationships", href: "/relationships" },
    { label: "Needs Follow-up",  value: String(metrics.requiresFollowUp), description: "Family outreach overdue",            href: "/relationships" },
  ];

  // Relationship Pipeline: where families and prospects stand in the funnel.
  const relationshipPipeline = [
    { label: "Pending Assessments",        value: String(metrics.pendingAssessments),       description: "Awaiting scheduling or completion", href: "/relationships" },
    { label: "Families Awaiting Proposal", value: String(metrics.familiesAwaitingProposal), description: "Ready to move forward",              href: "/relationships" },
    { label: "Birthdays This Week",        value: String(metrics.birthdaysThisWeek),        description: "Resident birthdays connected later" },
  ];

  return (
    <PageContainer title="Dashboard">
      <div className="mb-10">
        <p className="mb-2 font-sans text-label font-semibold uppercase tracking-[0.2em] text-gold-dark">
          {dashboardDate}
        </p>
        <h1 className="font-serif text-page-title font-light leading-tight text-body">
          {greeting}, {currentUser.shortName}.
        </h1>
        <p className="mt-2 font-sans text-base text-body">
          {community.communityName} - {activeProspectRelationships} active prospects,{" "}
          {metrics.requiresFollowUp} residents due for follow-up, and{" "}
          {metrics.pendingAssessments} assessments pending.
        </p>
      </div>

      <div className="divide-y divide-ivory-border border-t border-ivory-border">
        <section className="pb-10">
          <h2 className="mb-5 font-serif text-section-title font-light text-body">
            Community Snapshot
          </h2>
          <div className="grid grid-cols-4 gap-5">
            {communitySnapshot.map((stat) => (
              <DashboardCard key={stat.label} {...stat} />
            ))}
          </div>
        </section>

        <section className="py-10">
          <h2 className="mb-5 font-serif text-section-title font-light text-body">
            Relationship Pipeline
          </h2>
          <div className="grid grid-cols-4 gap-5">
            {relationshipPipeline.map((stat) => (
              <DashboardCard key={stat.label} {...stat} />
            ))}
          </div>
        </section>

        <section className="py-10">
          <h2 className="mb-5 font-serif text-section-title font-light text-body">
            Resident Wellness
          </h2>
          <div className="grid grid-cols-4 gap-5">
            <WellnessFollowUpsCard
              dueOrOverdue={metrics.wellnessFollowUpsDueOrOverdue}
              dueThisWeek={metrics.wellnessFollowUpsDueThisWeek}
            />
          </div>
        </section>

        <section className="py-10">
          <h2 className="mb-5 font-serif text-section-title font-light text-body">
            Staffing &amp; Recruiting
          </h2>
          <div className="grid grid-cols-4 gap-5">
            <DashboardCard
              label="Recruiting"
              value={String(recruitingReviewCount)}
              description="Applicants needing attention"
              href="/recruiting"
            />
          </div>
        </section>

        <section className="pt-10">
          <h2 className="mb-5 font-serif text-section-title font-light text-body">
            Website Intake
          </h2>
          <div className="grid grid-cols-4 gap-5">
            <DashboardCard
              label="New Website Inquiries"
              value={String(intakeQueueCounts.new)}
              description="Not yet processed"
              href="/relationships/intake?tab=new"
            />
            <DashboardCard
              label="Contact Ready"
              value={String(intakeQueueCounts.contactReady)}
              description="Relationship & follow-up ready"
              accent
              href="/relationships/intake?tab=processed"
            />
            <DashboardCard
              label="Needs Resolution"
              value={String(intakeQueueCounts.needsResolution)}
              description="Blocked — human decision required"
              href="/relationships/intake?tab=needs_resolution"
            />
            <DashboardCard
              label="Failed Intake Processing"
              value={String(intakeQueueCounts.failed)}
              description="Technical failures, retryable"
              href="/relationships/intake?tab=failed"
            />
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
