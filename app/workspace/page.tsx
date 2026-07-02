import {
  BarChart2,
  Briefcase,
  Building2,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Home,
  LayoutDashboard,
  Mail,
  Phone,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { PageContainer } from "@/components/PageContainer";
import { WorkspaceLaunchCard } from "@/components/workspace/WorkspaceLaunchCard";
import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import { getRecruitingLeads } from "@/lib/data/recruitingLeads";
import { buildCurrentUserDisplay } from "@/lib/auth/display";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { getCentralTimeGreeting } from "@/lib/utils/date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const workspaceUrls = {
  cinchCcm:
    process.env.NEXT_PUBLIC_CINCH_CCM_URL ??
    "https://www.cinchccmportal.com/login",
  axisCare:
    process.env.NEXT_PUBLIC_AXISCARE_URL ?? "https://16282.axiscare.com/",
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

const workspaceSections = [
  {
    title: "Resident Operations",
    items: [
      {
        icon: Users,
        title: "Resident Directory",
        description: "Browse all Watermere residents.",
        poweredBy: "Serve OS",
        href: "/residents",
      },
      {
        icon: ClipboardCheck,
        title: "Assessment Intake",
        description: "Launch the assessment and proposal workflow.",
        poweredBy: "Serve Intake",
        href: workspaceUrls.serveIntake,
        external: true,
      },
      {
        icon: FileText,
        title: "Proposal Builder",
        description: "Generate proposals and draft family emails.",
        poweredBy: "Serve Intake",
        href: workspaceUrls.serveIntake,
        external: true,
      },
      {
        icon: HeartPulse,
        title: "Wellness Checks",
        description: "Document wellness visits and follow-up observations.",
        poweredBy: "Serve OS",
        href: "#wellness-checks",
        disabled: true,
      },
    ],
  },
  {
    title: "Care Delivery",
    items: [
      {
        icon: Building2,
        title: "Community Care",
        description: "Open the Community Care platform.",
        poweredBy: "Cinch CCM",
        href: workspaceUrls.cinchCcm,
        external: true,
      },
      {
        icon: Home,
        title: "Traditional Home Care",
        description: "Open the Traditional Home Care platform.",
        poweredBy: "AxisCare",
        href: workspaceUrls.axisCare,
        external: true,
      },
    ],
  },
  {
    title: "Recruiting & Employees",
    items: [
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
        <p className="mb-2 font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-gold">
          Workspace
        </p>
        <h1 className="font-serif text-[2.6rem] font-light leading-tight text-navy">
          {greeting}, {currentUser.shortName}.
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-body">
          Start here for today&apos;s work, then launch the right workflow without
          thinking about which system runs underneath it.
        </p>
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl font-light text-navy">Today&apos;s Work</h2>
          <p className="font-sans text-xs text-muted">Personalized tasks will deepen here over time.</p>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {todaysWork.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
              className="rounded-lg border border-ivory-border bg-white p-4 shadow-card transition-colors hover:border-navy/20"
            >
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                {item.label}
              </p>
              <p className="mt-3 font-serif text-3xl font-light leading-none text-navy">
                {item.value}
              </p>
              <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
                {item.description}
              </p>
            </a>
          ))}
        </div>
      </section>

      <div className="space-y-9">
        {workspaceSections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-4 font-serif text-2xl font-light text-navy">
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
