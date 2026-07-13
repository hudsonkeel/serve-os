import Link from "next/link";
import {
  BarChart2,
  Briefcase,
  FileText,
  LayoutDashboard,
  ListChecks,
  Mail,
  Phone,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { PageContainer } from "@/components/PageContainer";
import { WorkspaceLaunchCard } from "@/components/workspace/WorkspaceLaunchCard";
import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import { getRecruitingLeads } from "@/lib/data/recruitingLeads";
import {
  getWorkflowsByCategory,
  isExternalWorkflow,
  platformLabel,
} from "@/lib/workflows/serveWorkflows";
import { buildCurrentUserDisplay } from "@/lib/auth/display";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { getCentralTimeGreeting } from "@/lib/utils/date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const workspaceUrls = {
  apploi:
    process.env.NEXT_PUBLIC_APPLOI_URL ?? "https://hire.apploi.com/v2",
  viventium:
    process.env.NEXT_PUBLIC_VIVENTIUM_URL ??
    "https://hcm.viventium.com/apps/account/viventium/login",
  serveIntake:
    process.env.NEXT_PUBLIC_SERVE_INTAKE_URL ??
    "https://serve-intake-mvp.vercel.app/",
  dialpad:
    process.env.NEXT_PUBLIC_DIALPAD_URL ?? "https://dialpad.com/login",
  gmail: process.env.NEXT_PUBLIC_GMAIL_URL ?? "https://mail.google.com/",
} as const;

const residentOperationsWorkflows = getWorkflowsByCategory(
  "resident_operations"
).map((workflow) => ({
  icon: workflow.icon,
  title: workflow.name,
  description: workflow.description,
  poweredBy: platformLabel(workflow),
  href: workflow.href,
  external: isExternalWorkflow(workflow),
}));

const careDeliveryWorkflows = getWorkflowsByCategory("care_delivery").map(
  (workflow) => ({
    icon: workflow.icon,
    title: workflow.name,
    description: workflow.description,
    poweredBy: platformLabel(workflow),
    href: workflow.href,
    external: isExternalWorkflow(workflow),
  })
);

const workspaceSections = [
  {
    title: "Resident Operations",
    items: residentOperationsWorkflows,
  },
  {
    title: "Care Delivery",
    items: careDeliveryWorkflows,
  },
  {
    // Recruiting no longer has a permanent sidebar item — it is primarily
    // operational work, surfaced here as the Workspace action entry point.
    // /recruiting remains the deep management route (see
    // docs/architecture/SERVE_OS_NAVIGATION_MODEL.md).
    title: "Recruiting & Hiring",
    items: [
      {
        icon: ListChecks,
        title: "Open Recruiting Pipeline",
        description: "Review candidates, interviews, eligibility, and hiring progress.",
        poweredBy: "Serve OS",
        href: "/recruiting",
      },
      {
        icon: UserPlus,
        title: "Recruiting",
        description: "Manage applicants and interviews.",
        poweredBy: "Apploi",
        href: workspaceUrls.apploi,
        external: true,
      },
      {
        icon: Briefcase,
        title: "Employees",
        description: "Employee information, HR and payroll.",
        poweredBy: "Viventium",
        href: workspaceUrls.viventium,
        external: true,
      },
    ],
  },
  {
    title: "Communications",
    items: [
      {
        icon: Phone,
        title: "Office Phone",
        description: "Calls, voicemail and transcripts.",
        poweredBy: "Dialpad",
        href: workspaceUrls.dialpad,
        external: true,
      },
      {
        icon: Mail,
        title: "Business Email",
        description: "Business email and family communication.",
        poweredBy: "Google Workspace",
        href: workspaceUrls.gmail,
        external: true,
      },
    ],
  },
  {
    title: "Intelligence",
    items: [
      {
        icon: BarChart2,
        title: "Community Intelligence",
        description: "Review community-level trends and resident insights.",
        poweredBy: "Serve OS",
        href: "/community-intelligence",
      },
      {
        icon: Sparkles,
        title: "Ask Serve",
        description: "Ask natural-language questions about residents and operations.",
        poweredBy: "Serve OS",
        href: "/ask-serve",
      },
      {
        icon: LayoutDashboard,
        title: "Dashboard",
        description: "Open the executive intelligence dashboard.",
        poweredBy: "Serve OS",
        href: "/",
      },
      {
        icon: FileText,
        title: "Reports (Coming Soon)",
        description: "Review recurring operational and executive reports.",
        poweredBy: "Serve OS",
        href: "#reports",
        disabled: true,
      },
    ],
  },
];

export default async function WorkspacePage() {
  const [profile, community, recruiting] = await Promise.all([
    getCurrentAuthorizedUser(),
    getCommunityMetrics(),
    getRecruitingLeads(),
  ]);
  const currentUser = buildCurrentUserDisplay(profile);
  const greeting = getCentralTimeGreeting();

  const recruitingReviewCount = recruiting.leads.filter((lead) =>
    ["new", "in_review"].includes(lead.status)
  ).length;

  const todaysWork = [
    {
      label: "Assessments",
      value: community.metrics.pendingAssessments,
      description: "Awaiting scheduling or completion",
      href: "/residents",
    },
    {
      label: "Follow-ups",
      value: community.metrics.requiresFollowUp,
      description: "Resident or family outreach",
      href: "/residents",
    },
    {
      label: "Wellness Follow-ups",
      value: community.metrics.wellnessFollowUpsDueOrOverdue,
      description: "Due or overdue",
      href: "/residents?tab=wellness_watch&wellnessDue=now",
    },
    {
      label: "Proposals",
      value: community.metrics.familiesAwaitingProposal,
      description: "Awaiting review",
      href: workspaceUrls.serveIntake,
      external: true,
    },
    {
      label: "Recruiting",
      value: recruitingReviewCount,
      description: "Applicants needing attention",
      href: "/recruiting",
    },
    {
      label: "Payroll",
      value: 0,
      description: "Reminders connected later",
      href: workspaceUrls.viventium,
      external: true,
    },
  ];

  return (
    <PageContainer title="Workspace">
      <div className="mb-8">
        <p className="mb-2 font-sans text-label font-semibold uppercase tracking-[0.2em] text-gold-dark">
          Workspace
        </p>
        <h1 className="font-serif text-page-title font-light leading-tight text-body">
          {greeting}, {currentUser.shortName}.
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-body">
          Start here for today&apos;s work, priorities, schedules, and operational
          workflows.
        </p>
      </div>

      <div className="divide-y divide-ivory-border border-t border-ivory-border">
        <section className="pb-10">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-serif text-section-title font-light text-body">Today&apos;s Work</h2>
            <p className="font-sans text-sm text-muted">Personalized tasks will deepen here over time.</p>
          </div>
          <div className="grid grid-cols-6 gap-4">
            {todaysWork.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                className="min-h-[132px] rounded-xl border border-ivory-border bg-surface p-5 shadow-card transition-all hover:-translate-y-px hover:border-navy/25 hover:shadow-card-hover"
              >
                <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
                  {item.label}
                </p>
                <p className="mt-3 font-serif text-4xl font-semibold leading-none tracking-tight text-body">
                  {item.value}
                </p>
                <p className="mt-2 font-sans text-sm leading-relaxed text-muted">
                  {item.description}
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="py-10">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-serif text-section-title font-light text-body">
              Today&apos;s Schedule
            </h2>
            <a
              href="#"
              className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
            >
              View all
            </a>
          </div>
          <div className="rounded-xl border border-ivory-border bg-surface px-6 py-10 text-center shadow-card">
            <p className="font-serif text-xl text-muted">No schedule is connected yet</p>
            <p className="mt-2 font-sans text-sm text-muted">
              Live visits and caregiver assignments will appear here when scheduling
              integration is available.
            </p>
          </div>
        </section>

        <section className="py-10">
          <h2 className="mb-5 font-serif text-section-title font-light text-body">
            Starting This Week
          </h2>
          <div className="rounded-xl border border-ivory-border bg-surface p-8 text-center shadow-card">
            <p className="font-sans text-sm text-muted">
              No resident starts require action this week.
            </p>
            <div className="pt-3">
              <Link
                href="/residents"
                className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
              >
                View all residents
              </Link>
            </div>
          </div>
        </section>

        {workspaceSections.map((section) => (
          <section key={section.title} className="py-10">
            <h2 className="mb-5 font-serif text-section-title font-light text-body">
              {section.title}
            </h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {section.items.map((item) => (
                <WorkspaceLaunchCard key={item.title} {...item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
