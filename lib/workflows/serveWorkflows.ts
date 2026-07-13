import {
  Building2,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Home,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ServeWorkflowCategory =
  | "resident_operations"
  | "care_delivery"
  | "administration";

export type ServeWorkflowPlatform =
  | "serve_os"
  | "serve_intake"
  | "cinch_ccm"
  | "axiscare";

export interface ServeWorkflow {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: ServeWorkflowCategory;
  platform: ServeWorkflowPlatform;
  enabled: boolean;
}

const PLATFORM_LABELS: Record<ServeWorkflowPlatform, string> = {
  serve_os: "Serve OS",
  serve_intake: "Serve Intake",
  cinch_ccm: "Cinch CCM",
  axiscare: "AxisCare",
};

export function platformLabel(workflow: ServeWorkflow): string {
  return PLATFORM_LABELS[workflow.platform];
}

// Serve Intake and the care-delivery platforms are separately hosted
// applications reached over the open internet; every non-"serve_os"
// workflow opens in a new tab rather than navigating Serve OS away.
export function isExternalWorkflow(workflow: ServeWorkflow): boolean {
  return workflow.platform !== "serve_os";
}

const serveIntakeUrl =
  process.env.NEXT_PUBLIC_SERVE_INTAKE_URL ??
  "https://serve-intake-mvp.vercel.app/";
const cinchCcmUrl =
  process.env.NEXT_PUBLIC_CINCH_CCM_URL ??
  "https://www.cinchccmportal.com/login";
const axisCareUrl =
  process.env.NEXT_PUBLIC_AXISCARE_URL ?? "https://16282.axiscare.com/";

// Single source of truth for every Resident Operations / Care Delivery
// launch card in Workspace. Label, description, destination, icon, and
// platform attribution live here exactly once so they cannot drift between
// renderings of the same workflow.
export const SERVE_WORKFLOWS: ServeWorkflow[] = [
  {
    id: "resident_directory",
    name: "Resident Directory",
    description: "Browse all Watermere residents.",
    href: "/residents",
    icon: Users,
    category: "resident_operations",
    platform: "serve_os",
    enabled: true,
  },
  {
    id: "assessment_intake",
    name: "Assessment Intake",
    description: "Launch the assessment and proposal workflow.",
    href: serveIntakeUrl,
    icon: ClipboardCheck,
    category: "resident_operations",
    platform: "serve_intake",
    enabled: true,
  },
  {
    id: "proposal_builder",
    name: "Proposal Builder",
    description: "Generate proposals and draft family emails.",
    href: serveIntakeUrl,
    icon: FileText,
    category: "resident_operations",
    platform: "serve_intake",
    enabled: true,
  },
  {
    id: "record_wellness_observation",
    name: "Wellness Checks",
    description: "Search for a resident and record a wellness change.",
    href: "/residents/wellness/new",
    icon: HeartPulse,
    category: "resident_operations",
    platform: "serve_os",
    enabled: true,
  },
  {
    id: "community_care",
    name: "Community Care",
    description: "Open the Community Care platform.",
    href: cinchCcmUrl,
    icon: Building2,
    category: "care_delivery",
    platform: "cinch_ccm",
    enabled: true,
  },
  {
    id: "traditional_home_care",
    name: "Traditional Home Care",
    description: "Open the Traditional Home Care platform.",
    href: axisCareUrl,
    icon: Home,
    category: "care_delivery",
    platform: "axiscare",
    enabled: true,
  },
];

export function getWorkflowsByCategory(
  category: ServeWorkflowCategory
): ServeWorkflow[] {
  return SERVE_WORKFLOWS.filter((workflow) => workflow.category === category);
}
