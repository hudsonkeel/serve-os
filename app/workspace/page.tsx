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
import { TodaysSchedulePanel } from "@/components/scheduling/TodaysSchedulePanel";
import { getAxisCareTodaysSchedule } from "@/lib/scheduling/todaysSchedule";
import {
  getWorkflowsByCategory,
  isExternalWorkflow,
  platformLabel,
} from "@/lib/workflows/serveWorkflows";
import { buildCurrentUserDisplay } from "@/lib/auth/display";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { getCentralTimeGreeting } from "@/lib/utils/date";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { TODAY_WORK_CONTEXT } from "@/lib/askServe/areaContexts";
import { getTodaysWorkItems } from "@/lib/data/todaysWork";
import { TodaysWorkView } from "@/components/workspace/TodaysWorkView";
import { buildWorkspaceHref, countActionableWorkItems, parseWorkspaceFilters } from "@/lib/workspace/urlFilters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const workspaceUrls = {
  apploi:
    process.env.NEXT_PUBLIC_APPLOI_URL ?? "https://hire.apploi.com/v2",
  viventium:
    process.env.NEXT_PUBLIC_VIVENTIUM_URL ??
    "https://hcm.viventium.com/apps/account/viventium/login",
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
    // Recruiting also has a permanent sidebar entry ("The People Who
    // Serve", /recruiting) as of the human-centered navigation redesign —
    // this Workspace entry point stays as the day-to-day operational
    // shortcut into the same route (see
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
        title: "How We're Doing",
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

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; source?: string }>;
}) {
  // Org-wide Today's Work dashboard, not the community-scoped People We
  // Serve surface — see the identical note in app/dashboard/page.tsx.
  const [profile, schedule, workItems, rawSearchParams] = await Promise.all([
    getCurrentAuthorizedUser(),
    getAxisCareTodaysSchedule(),
    getTodaysWorkItems(),
    searchParams,
  ]);
  const currentUser = buildCurrentUserDisplay(profile);
  const greeting = getCentralTimeGreeting();
  const askServeEnabled = isContextualAskServeEnabled(currentUser.role);
  const initialFilters = parseWorkspaceFilters(rawSearchParams);

  // Today's Work Actionability slice, product decision #2/"Summary Source
  // of Truth" — every card below that claims to represent Today's Work is
  // now a plain count over the SAME composed `workItems` array
  // TodaysWorkView renders further down the page, filtered by the exact
  // sourceType(s) that card's click-through reveals. No independent
  // CRM/pipeline-population query backs any of these anymore (that
  // divergence — a count that could silently disagree with what's actually
  // listed below it — was the bug this slice fixes). Broader population
  // metrics (e.g. "how many relationships are in assessment_scheduled at
  // all," regardless of Continuity Rule staleness) still live on their own
  // domain surfaces (Residents directory, Relationships/Prospects board,
  // How We're Doing) — deliberately not reproduced here.
  const operationalSummary = [
    {
      label: "Assessments",
      value: countActionableWorkItems(workItems, "assessment"),
      description: "Continuity-Rule actionable",
      href: buildWorkspaceHref({ source: "assessment" }),
    },
    {
      label: "Follow-ups",
      value: countActionableWorkItems(workItems, "relationship_action"),
      description: "Open relationship actions",
      href: buildWorkspaceHref({ source: "relationship_action" }),
    },
    {
      label: "Wellness Follow-ups",
      value: countActionableWorkItems(workItems, "wellness_follow_up"),
      description: "Due or overdue",
      href: buildWorkspaceHref({ source: "wellness_follow_up" }),
    },
    {
      label: "Proposals",
      value: countActionableWorkItems(workItems, "proposal"),
      description: "Continuity-Rule actionable",
      href: buildWorkspaceHref({ source: "proposal" }),
    },
    {
      label: "Recruiting",
      value: countActionableWorkItems(workItems, "recruiting"),
      description: "Continuity-Rule actionable",
      href: buildWorkspaceHref({ source: "recruiting" }),
    },
    {
      label: "Payroll",
      value: null,
      description: "Additional AxisCare integration in progress",
      href: workspaceUrls.viventium,
      external: true,
    },
    {
      // One coherent card for every governance-shaped source (Incidents,
      // Infections, Emergency Preparedness obligations, and Corrective
      // Actions independently of what created them) rather than a
      // separate card per source — see GOVERNANCE_SOURCE_TYPES in
      // lib/workspace/urlFilters.ts. Deliberately not a QAPI Activity
      // Signal (those are factual/historical counts on /qapi; this is the
      // actionable-workload count for the exact items listed below).
      label: "Governance & Quality",
      value: countActionableWorkItems(workItems, "governance"),
      description: "Incidents, Infections, EPRP, Corrective Actions",
      href: buildWorkspaceHref({ source: "governance" }),
    },
  ];

  return (
    <PageContainer title="Today's Work">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <p className="mb-2 font-sans text-label font-semibold uppercase tracking-[0.2em] text-gold-dark">
            Today&apos;s Work
          </p>
          <h1 className="font-serif text-page-title font-light leading-tight text-body">
            {greeting}, {currentUser.shortName}.
          </h1>
          <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-body">
            Start here for today&apos;s work, priorities, schedules, and operational
            workflows.
          </p>
        </div>
        {askServeEnabled && (
          <AskServeTrigger
            context={buildAskServeContext(TODAY_WORK_CONTEXT, {
              userRole: currentUser.role ?? undefined,
              // Reflects the continuity view's actual initial filter now
              // that it's URL-backed — still the initial-value-only
              // convention already used by app/residents/page.tsx's tab
              // filters, just sourced from the URL instead of a hardcoded
              // default.
              visibleFilters: { workFilter: initialFilters.view },
            })}
            label="Ask Serve about today's work"
          />
        )}
      </div>

      <div className="divide-y divide-ivory-border border-t border-ivory-border">
        <section className="pb-10">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-serif text-section-title font-light text-body">Operational Summary</h2>
            <p className="font-sans text-sm text-muted">Each number is exactly what&apos;s listed below — click to jump to it.</p>
          </div>
          <div className="grid grid-cols-4 gap-4 lg:grid-cols-7">
            {operationalSummary.map((item) => (
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
                {item.value === null ? (
                  <p className="mt-3 font-sans text-sm leading-snug text-muted">{item.description}</p>
                ) : (
                  <>
                    <p className="mt-3 font-serif text-4xl font-semibold leading-none tracking-tight text-body">
                      {item.value}
                    </p>
                    <p className="mt-2 font-sans text-sm leading-relaxed text-muted">
                      {item.description}
                    </p>
                  </>
                )}
              </a>
            ))}
          </div>
        </section>

        <section className="py-10">
          <div className="mb-5">
            <h2 className="font-serif text-section-title font-light text-body">What Exactly Should I Do?</h2>
            <p className="font-sans text-sm text-muted">
              Real, individually-addressable work — every item links back to its source and explains why it&apos;s here.
            </p>
          </div>
          <TodaysWorkView
            items={workItems}
            currentUser={{ email: currentUser.email, fullName: currentUser.fullName }}
            initialFilters={initialFilters}
          />
        </section>

        <TodaysSchedulePanel result={schedule} />

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
