// Every significant thing that happens in Serve OS is typed here as an event.
// Notification rules subscribe to these events; forms and actions just emit them.
//
// To add a new notification: add the event type here, add a payload interface,
// extend NotificationEvent, then write a rule in rules.ts.

export type NotificationEventType =
  // ─── Recruiting ───────────────────────────────────────────────
  | "recruiting_lead.caregiver_created"
  | "recruiting_lead.md_created"
  // ─── Prospects ────────────────────────────────────────────────
  | "prospect.created"
  | "prospect.completed";
  // Future:
  // | "assessment.completed"
  // | "proposal.generated"
  // | "client.created"

// ─── Payload shapes ─────────────────────────────────────────────

export interface RecruitingLeadPayload {
  leadId: string;
  role: "caregiver" | "managing_director";
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  cityState?: string;
  availability?: string;
  experienceLevel?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  resumeFilename?: string;
  explorationTimeline?: string;
  message?: string;
}

export interface ProspectPayload {
  prospectId: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  zipCode?: string;
  supportType?: string;
}

// ─── Event union ────────────────────────────────────────────────

export type NotificationEvent =
  | { type: "recruiting_lead.caregiver_created"; payload: RecruitingLeadPayload }
  | { type: "recruiting_lead.md_created"; payload: RecruitingLeadPayload }
  | { type: "prospect.created"; payload: ProspectPayload }
  | { type: "prospect.completed"; payload: ProspectPayload };

// ─── Channel types ──────────────────────────────────────────────

// Today: "email" only. Extend this union when new channels are added.
export type NotificationChannel = "email";

export interface NotificationRule {
  event: NotificationEventType;
  channel: NotificationChannel;
  getRecipients: () => string[];
  getSubject: (payload: Record<string, unknown>) => string;
  getBody: (payload: Record<string, unknown>) => string;
}
