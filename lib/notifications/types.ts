// Every significant thing that happens in Serve OS is typed here as an event.
// Notification rules subscribe to these events; forms and actions just emit them.
//
// To add a new notification: add the event type here, add a payload interface,
// extend NotificationEvent, then write a rule in rules.ts.

export type NotificationEventType =
  // ─── Recruiting ───────────────────────────────────────────────
  | "recruiting_lead.caregiver_created"
  | "recruiting_lead.md_created"
  // ─── Governance / Decision Intelligence ────────────────────────
  | "compliance.executive_review_required";
  // Future:
  // | "assessment.completed"
  // | "proposal.generated"
  // | "client.created"
  // | "intake.contact_ready" — the Scope J successor to the retired
  //   prospect.completed rule, not yet built.

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

// Fired by the generic Decision Intelligence service
// (lib/intelligence/decisionEngine/) when a decision's operational outcome
// is executive_review_required — today, only Background Eligibility's
// Presumptive Disqualification tier produces this. Deliberately named by
// domain + outcome, not by decision type, so a future decision type in the
// same domain can reuse this event rather than needing its own.
export interface ExecutiveReviewRequiredPayload {
  recommendationId: string;
  subjectType: string;
  subjectId: string;
  decisionTitle: string;
  decisionDescription: string;
}

// ─── Event union ────────────────────────────────────────────────

export type NotificationEvent =
  | { type: "recruiting_lead.caregiver_created"; payload: RecruitingLeadPayload }
  | { type: "recruiting_lead.md_created"; payload: RecruitingLeadPayload }
  | { type: "compliance.executive_review_required"; payload: ExecutiveReviewRequiredPayload };

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
