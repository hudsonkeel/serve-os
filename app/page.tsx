import { PageContainer } from "@/components/PageContainer";
import { DashboardCard } from "@/components/DashboardCard";
import { ScheduleCard } from "@/components/ScheduleCard";
import { QuickActionCard } from "@/components/QuickActionCard";
import { Users, HeartPulse, Calendar, ClipboardList } from "lucide-react";
import {
  COMMUNITY,
  DEMO_SCHEDULE,
  DEMO_STARTING_THIS_WEEK,
} from "@/lib/demo/communityData";

const communityStats = [
  { label: "Residents",         value: String(COMMUNITY.totalResidents),        description: "Watermere at Frisco",          accent: true },
  { label: "Serve Clients",     value: String(COMMUNITY.serveClients),          description: "Active Serve relationships" },
  { label: "Active Prospects",  value: String(COMMUNITY.activeProspects),       description: "In intake or follow-up" },
  { label: "Needs Follow-up",   value: String(COMMUNITY.requiresFollowUp),      description: "Family outreach overdue" },
];

const operationsStats = [
  { label: "Pending Assessments",        value: String(COMMUNITY.pendingAssessments),       description: "Awaiting scheduling or completion" },
  { label: "Families Awaiting Proposal", value: String(COMMUNITY.familiesAwaitingProposal), description: "Ready to move forward" },
  { label: "Birthdays This Week",        value: String(COMMUNITY.birthdaysThisWeek),         description: "Send a card or reach out" },
  { label: "Wellness Checks Due",        value: String(COMMUNITY.wellnessChecksDue),         description: "Overdue or due today" },
];

const quickActions = [
  { icon: Users,         label: "View Residents",      description: "Browse the full community roster" },
  { icon: HeartPulse,    label: "Log Wellness Check",  description: "Record a resident wellness note" },
  { icon: Calendar,      label: "Schedule Assessment", description: "Book a home assessment visit" },
  { icon: ClipboardList, label: "New Intake Request",  description: "Start the care intake process" },
];

export default function DashboardPage() {
  return (
    <PageContainer title="Dashboard">
      {/* ─── Greeting ─── */}
      <div className="mb-10">
        <p className="mb-2 font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-gold">
          Friday, June 26
        </p>
        <h1 className="font-serif text-[2.6rem] font-light leading-tight text-navy">
          Good morning, Elizabeth.
        </h1>
        <p className="mt-2 font-sans text-sm text-body">
          {COMMUNITY.name} · {COMMUNITY.activeProspects} active prospects, {COMMUNITY.requiresFollowUp} residents due for
          follow-up, and {COMMUNITY.pendingAssessments} assessments pending.
        </p>
      </div>

      {/* ─── Community Stat Cards ─── */}
      <div className="mb-5 grid grid-cols-4 gap-5">
        {communityStats.map((s) => (
          <DashboardCard key={s.label} {...s} />
        ))}
      </div>

      {/* ─── Operations Stat Cards ─── */}
      <div className="mb-10 grid grid-cols-4 gap-5">
        {operationsStats.map((s) => (
          <DashboardCard key={s.label} {...s} />
        ))}
      </div>

      {/* ─── Lower Layout ─── */}
      <div className="grid grid-cols-3 gap-6">

        {/* Today's Schedule — 2 cols */}
        <div className="col-span-2">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-light text-navy">
              Today&rsquo;s Schedule
            </h2>
            <a href="#" className="font-sans text-xs text-gold transition-colors hover:text-gold-dark">
              View all →
            </a>
          </div>
          <div className="space-y-3">
            {DEMO_SCHEDULE.map((item) => (
              <ScheduleCard key={`${item.client}-${item.time}`} {...item} />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-7">

          {/* Starting This Week */}
          <div>
            <h2 className="mb-4 font-serif text-2xl font-light text-navy">
              Starting This Week
            </h2>
            <div className="rounded-xl bg-white p-5 shadow-card">
              {DEMO_STARTING_THIS_WEEK.map((client, i) => (
                <div
                  key={client.name}
                  className={`flex items-center gap-3 py-3 ${
                    i < DEMO_STARTING_THIS_WEEK.length - 1 ? "border-b border-ivory-warm" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/10 font-sans text-[11px] font-medium text-gold">
                    {client.initials}
                  </div>
                  <div>
                    <p className="font-sans text-sm font-medium text-navy">
                      {client.name}
                    </p>
                    <p className="font-sans text-[11px] text-muted">
                      Starting {client.start}
                    </p>
                  </div>
                </div>
              ))}
              <div className="pt-3">
                <a href="/residents" className="font-sans text-xs text-gold transition-colors hover:text-gold-dark">
                  View all residents →
                </a>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
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
