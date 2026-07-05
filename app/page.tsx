import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { DashboardCard } from "@/components/DashboardCard";
import { QuickActionCard } from "@/components/QuickActionCard";
import { Users, HeartPulse, Calendar, ClipboardList } from "lucide-react";
import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import {
  formatCentralDashboardDate,
  getCentralTimeGreeting,
} from "@/lib/utils/date";
import { buildCurrentUserDisplay } from "@/lib/auth/display";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const quickActions = [
  { icon: Users,         label: "View Residents",      description: "Browse the full community roster" },
  { icon: HeartPulse,    label: "Log Wellness Check",  description: "Record a resident wellness note" },
  { icon: Calendar,      label: "Schedule Assessment", description: "Book a home assessment visit" },
  { icon: ClipboardList, label: "New Intake Request",  description: "Start the care intake process" },
];

export default async function DashboardPage() {
  const profile = await getCurrentAuthorizedUser();
  const currentUser = buildCurrentUserDisplay(profile);
  const community = await getCommunityMetrics();
  const { metrics } = community;
  const dashboardDate = formatCentralDashboardDate();
  const greeting = getCentralTimeGreeting();

  const communityStats = [
    { label: "Residents",        value: String(metrics.totalResidents),   description: community.communityName,        accent: true },
    { label: "Serve Clients",    value: String(metrics.serveClients),     description: "Active Serve relationships" },
    { label: "Serve Prospects",  value: String(metrics.activeProspects),  description: "Residents in prospect stage" },
    { label: "Needs Follow-up",  value: String(metrics.requiresFollowUp), description: "Family outreach overdue" },
  ];

  const operationsStats = [
    { label: "Pending Assessments",        value: String(metrics.pendingAssessments),        description: "Awaiting scheduling or completion" },
    { label: "Families Awaiting Proposal", value: String(metrics.familiesAwaitingProposal),  description: "Ready to move forward" },
    { label: "Birthdays This Week",        value: String(metrics.birthdaysThisWeek),         description: "Resident birthdays connected later" },
    { label: "Wellness Checks Due",        value: String(metrics.wellnessChecksDue),         description: "Overdue or due today" },
  ];

  return (
    <PageContainer title="Dashboard">
      <div className="mb-10">
        <p className="mb-2 font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-gold">
          {dashboardDate}
        </p>
        <h1 className="font-serif text-[2.6rem] font-light leading-tight text-navy">
          {greeting}, {currentUser.shortName}.
        </h1>
        <p className="mt-2 font-sans text-sm text-body">
          {community.communityName} - {metrics.activeProspects} active prospects,{" "}
          {metrics.requiresFollowUp} residents due for follow-up, and{" "}
          {metrics.pendingAssessments} assessments pending.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-5">
        {communityStats.map((stat) => (
          <DashboardCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="mb-10 grid grid-cols-4 gap-5">
        {operationsStats.map((stat) => (
          <DashboardCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-light text-navy">
              Today&rsquo;s Schedule
            </h2>
            <a href="#" className="font-sans text-xs text-gold transition-colors hover:text-gold-dark">
              View all
            </a>
          </div>
          <div className="rounded-xl border border-ivory-border bg-white px-6 py-10 text-center shadow-card">
            <p className="font-serif text-xl text-muted">No schedule connected yet</p>
            <p className="mt-2 font-sans text-sm text-muted">
              Live visits and caregiver assignments will appear here once scheduling is connected.
            </p>
          </div>
        </div>

        <div className="space-y-7">
          <div>
            <h2 className="mb-4 font-serif text-2xl font-light text-navy">
              Starting This Week
            </h2>
            <div className="rounded-xl bg-white p-5 text-center shadow-card">
              <p className="font-sans text-sm text-muted">No client starts connected yet.</p>
              <div className="pt-3">
                <Link href="/residents" className="font-sans text-xs text-gold transition-colors hover:text-gold-dark">
                  View all residents
                </Link>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 font-serif text-2xl font-light text-navy">
              Quick Actions
            </h2>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <QuickActionCard key={action.label} {...action} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
