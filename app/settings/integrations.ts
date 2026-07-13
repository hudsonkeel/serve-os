// Structured integration registry for Settings > Integrations. Local to the
// Settings domain — nothing else in the app renders this data. See
// docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md for the three-attribute
// model (status / role / current-vs-future scope) and the rules for what
// each field is allowed to imply.

export type IntegrationStatus =
  | "connected"
  | "external_launch"
  | "planned"
  | "not_connected";

export interface IntegrationDefinition {
  id: string;
  name: string;
  // Only Specialty Answering Service currently needs a spelled-out form
  // alongside its abbreviation.
  expandedName?: string;
  description: string;
  status: IntegrationStatus;
  role: string;
  currentScope?: string[];
  futureScope?: string[];
  dataDirection?: string;
  sourceOfTruth: string;
}

// Expanded, unambiguous wording per the Serve OS Settings convention —
// deliberately not the short "Connected" / "External Launch" / "Planned"
// forms, which read as more definitive than the underlying reality.
export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Connected Integration",
  external_launch: "External System Link",
  planned: "Planned Integration",
  not_connected: "Not Connected",
};

// Resend is the one integration with a real, dynamic status (presence of
// RESEND_API_KEY) — everything else here is a fixed architectural fact, so
// this is the only field the page needs to pass in.
export function buildIntegrationDefinitions(options: {
  resendConnected: boolean;
}): IntegrationDefinition[] {
  return [
    {
      id: "supabase",
      name: "Supabase",
      description:
        "Resident, wellness, prospect, recruiting, and operational data store",
      status: "connected",
      role: "Canonical operational database for Serve OS.",
      currentScope: [
        "Residents",
        "Resident relationships and contacts",
        "Wellness observations and follow-ups",
        "Prospects",
        "Recruiting leads",
        "Serve OS authentication and authorized application data",
      ],
      futureScope: ["Additional operational domains as Serve OS expands"],
      dataDirection: "Read / write",
      sourceOfTruth: "Serve OS / Supabase",
    },
    {
      id: "serve_intake",
      name: "Serve Intake",
      description: "Assessment and proposal workflow",
      status: "external_launch",
      role: "Operational assessment, care recommendation, pricing, and proposal-generation workflow.",
      currentScope: [
        "External launch from Serve OS",
        "Assessment workflow",
        "Proposal workflow",
      ],
      futureScope: [
        "Tighter resident-context handoff",
        "Assessment results synchronized into Serve OS",
        "Follow-up and proposal status synchronization",
      ],
      dataDirection:
        "Launch-only today; future two-way operational synchronization",
      sourceOfTruth: "Serve Intake for assessment workflow outputs",
    },
    {
      id: "cinch_ccm",
      name: "CINCH CCM",
      description: "Community Care platform",
      status: "external_launch",
      role: "Downstream system of record for community-care delivery.",
      currentScope: [
        "External launch only",
        "Community-care operational execution remains in CINCH CCM",
      ],
      futureScope: [
        "Client/resident synchronization",
        "Visit plans",
        "Tracks",
        "Caregiver assignments",
        "Schedule data",
        "Visit completion",
        "Care notes",
        "Care-plan or assessment outputs where supported",
      ],
      dataDirection:
        "Launch-only today; future read/write integration subject to supported access",
      sourceOfTruth: "CINCH CCM for community-care execution",
    },
    {
      id: "axiscare",
      name: "AxisCare",
      description: "Traditional Home Care platform",
      status: "external_launch",
      role: "Downstream system of record for traditional home-care scheduling and execution.",
      currentScope: [
        "External launch only",
        "Traditional home-care scheduling, EVV, visit execution, and related operations remain in AxisCare",
      ],
      futureScope: [
        "Clients",
        "Caregivers",
        "Availability",
        "Schedules and visits",
        "Assignments",
        "Visit status",
        "Clock-in / clock-out",
        "EVV",
        "Schedule variance and exception data",
        "Approved schedule publishing from Serve OS where supported",
      ],
      dataDirection:
        "Launch-only today; future read/write integration subject to API access",
      sourceOfTruth: "AxisCare for traditional home-care execution",
    },
    {
      id: "apploi",
      name: "Apploi",
      description: "Recruiting applicant tracking",
      status: "external_launch",
      role: "System of record for job postings, applicants, and recruiting workflow.",
      currentScope: [
        "External launch",
        "Recruiting pipeline remains in Apploi",
        "Serve OS stores selected recruiting leads and operational follow-up context",
      ],
      futureScope: [
        "Applicant and status synchronization",
        "Interview milestones",
        "Hiring-stage updates",
        "Duplicate-entry reduction",
      ],
      dataDirection:
        "Launch-only today; future read synchronization and selective status updates",
      sourceOfTruth: "Apploi for applicant tracking",
    },
    {
      id: "viventium",
      name: "Viventium",
      description: "Employee HR and payroll",
      status: "external_launch",
      role: "System of record for employee onboarding, HR, payroll, and related workforce administration.",
      currentScope: [
        "External launch",
        "HR and payroll execution remain in Viventium",
      ],
      futureScope: [
        "Employee identifiers",
        "Onboarding status",
        "Payroll status",
        "Credential or employment-state visibility where supported",
        "Reduced duplicate workforce entry",
      ],
      dataDirection:
        "Launch-only today; future read synchronization and limited workflow handoff",
      sourceOfTruth: "Viventium for HR and payroll",
    },
    {
      id: "dialpad",
      name: "Dialpad",
      description: "Office phone, voicemail, and transcripts",
      status: "external_launch",
      role: "Communication platform for office calls, voicemail, and call transcripts.",
      currentScope: ["External launch", "Calls and voicemail remain in Dialpad"],
      futureScope: [
        "Missed-call alerts",
        "Voicemail/transcript ingestion",
        "Resident/family communication matching",
        "Action-item extraction",
        "Communication follow-up creation",
      ],
      dataDirection: "Launch-only today; future inbound communication data",
      sourceOfTruth: "Dialpad for calls and transcripts",
    },
    {
      id: "google_workspace",
      name: "Google Workspace",
      description: "Business email and collaboration",
      status: "external_launch",
      role: "System of record for Serve business email, calendar, and document collaboration.",
      currentScope: [
        "External launch",
        "Email and calendar remain in Google Workspace",
      ],
      futureScope: [
        "Relevant email visibility",
        "Calendar coordination",
        "Communication follow-up detection",
        "Document linking where appropriate",
      ],
      dataDirection:
        "Launch-only today; future selective inbound and action synchronization",
      sourceOfTruth: "Google Workspace for email, calendar, and documents",
    },
    {
      id: "resend",
      name: "Resend",
      description: "Outbound email notifications",
      status: options.resendConnected ? "connected" : "not_connected",
      role: "Outbound notification delivery service for Serve OS.",
      currentScope: [
        "Operational email alerts sent by Serve OS",
        "Website/intake and workflow notifications where already implemented",
      ],
      futureScope: [
        "Broader notification templates",
        "Delivery-status visibility",
        "Role-based notification preferences",
        "Additional operational alerts",
      ],
      dataDirection: "Outbound",
      sourceOfTruth: "Serve OS for notification intent; Resend for delivery",
    },
    {
      id: "sas_answering_service",
      name: "SAS Answering Service",
      expandedName: "Specialty Answering Service",
      description: "After-hours call coverage",
      status: "planned",
      role: "Trial after-hours answering and escalation service.",
      currentScope: [
        "Trial in progress",
        "No production data integration",
        "Communication is handled outside Serve OS",
      ],
      futureScope: [
        "After-hours message ingestion",
        "Resident/family matching",
        "Urgency classification",
        "Communication follow-up creation",
        "Escalation visibility",
        "Closed-loop resolution tracking",
      ],
      dataDirection:
        "Not yet integrated; future inbound communication and escalation data",
      sourceOfTruth:
        "Specialty Answering Service for after-hours call records until integrated",
    },
  ];
}
