import type {
  RelationshipActionType,
  RelationshipPriority,
  PipelineStage,
  RelationshipStatus,
  RelationshipTouchType,
  RelationshipType,
  RelationshipWorkingNoteCategory,
  RelationshipInteractionResult,
  RelationshipInteractionParticipantRole,
  RelationshipInsightCategory,
  RelationshipCommitmentResponsiblePartyType,
  RelationshipInteractionSuggestionType,
  RelationshipInteractionSuggestionStatus,
  ResidenceType,
} from "@/lib/supabase/types";

// Controlled-value lists and their user-facing labels for the Relationship
// CRM foundation. See docs/design/RELATIONSHIPS.md for definitions.

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "resident_prospect",
  "external_prospect",
  "active_client",
  "former_client",
  "referral_source",
  "community_partner",
  "professional_contact",
  "other",
];

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  resident_prospect: "Resident Prospect",
  external_prospect: "External Prospect",
  active_client: "Active Client",
  former_client: "Former Client",
  referral_source: "Referral Source",
  community_partner: "Community Partner",
  professional_contact: "Professional Contact",
  other: "Other",
};

export const RELATIONSHIP_STAGES: readonly PipelineStage[] = [
  "new_inquiry",
  "contact_attempted",
  "connected",
  "discovery",
  "assessment_scheduled",
  "assessment_completed",
  "proposal_in_progress",
  "proposal_sent",
  "considering",
  "follow_up_needed",
  "ready_to_start",
  "won",
  "on_hold",
  "closed_lost",
];

export const RELATIONSHIP_STAGE_LABELS: Record<PipelineStage, string> = {
  new_inquiry: "New Inquiry",
  contact_attempted: "Contact Attempted",
  connected: "Connected",
  discovery: "Discovery",
  assessment_scheduled: "Assessment Scheduled",
  assessment_completed: "Assessment Completed",
  proposal_in_progress: "Proposal in Progress",
  proposal_sent: "Proposal Sent",
  considering: "Considering",
  follow_up_needed: "Follow-up Needed",
  ready_to_start: "Ready to Start",
  won: "Won",
  on_hold: "On Hold",
  closed_lost: "Closed / Not Moving Forward",
};

export const RELATIONSHIP_STATUSES: readonly RelationshipStatus[] = [
  "active",
  "on_hold",
  "closed",
];

export const RELATIONSHIP_PRIORITIES: readonly RelationshipPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export const RELATIONSHIP_PRIORITY_LABELS: Record<RelationshipPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const RELATIONSHIP_TOUCH_TYPES: readonly RelationshipTouchType[] = [
  "call",
  "email",
  "text",
  "meeting",
  "resident_visit",
  "internal_discussion",
  "community_interaction",
  "assessment",
  "proposal",
  "other",
];

export const RELATIONSHIP_TOUCH_TYPE_LABELS: Record<RelationshipTouchType, string> = {
  call: "Call",
  email: "Email",
  text: "Text",
  meeting: "Meeting",
  assessment: "Assessment",
  resident_visit: "Resident Visit",
  proposal: "Proposal",
  internal_discussion: "Internal Discussion",
  community_interaction: "Community Interaction",
  other: "Other",
};

// Relationship Intelligence Phase 1 — see
// docs/architecture/relationship-intelligence-phase-1-implementation.md.

export const RELATIONSHIP_INTERACTION_RESULTS: readonly RelationshipInteractionResult[] = [
  "connected",
  "left_voicemail",
  "no_response",
  "information_sent",
  "information_received",
  "meeting_scheduled",
  "decision_pending",
  "follow_up_requested",
  "not_interested",
  "service_interest_confirmed",
  "other",
];

export const RELATIONSHIP_INTERACTION_RESULT_LABELS: Record<RelationshipInteractionResult, string> = {
  connected: "Connected",
  left_voicemail: "Left Voicemail",
  no_response: "No Response",
  information_sent: "Information Sent",
  information_received: "Information Received",
  meeting_scheduled: "Meeting Scheduled",
  decision_pending: "Decision Pending",
  follow_up_requested: "Follow-Up Requested",
  not_interested: "Not Interested",
  service_interest_confirmed: "Service Interest Confirmed",
  other: "Other",
};

export const RELATIONSHIP_INTERACTION_PARTICIPANT_ROLES: readonly RelationshipInteractionParticipantRole[] = [
  "primary_contact",
  "resident",
  "family_member",
  "serve_team_member",
  "community_contact",
  "other",
];

export const RELATIONSHIP_INTERACTION_PARTICIPANT_ROLE_LABELS: Record<
  RelationshipInteractionParticipantRole,
  string
> = {
  primary_contact: "Primary Contact",
  resident: "Resident",
  family_member: "Family Member",
  serve_team_member: "Serve Team Member",
  community_contact: "Community Contact",
  other: "Other",
};

export const RELATIONSHIP_INSIGHT_CATEGORIES: readonly RelationshipInsightCategory[] = [
  "resident_preference",
  "family_context",
  "decision_dynamics",
  "communication_preference",
  "timing",
  "service_need",
  "concern_or_barrier",
  "financial_consideration",
  "community_context",
  "operational",
  "other",
];

export const RELATIONSHIP_INSIGHT_CATEGORY_LABELS: Record<RelationshipInsightCategory, string> = {
  resident_preference: "Resident Preference",
  family_context: "Family Context",
  decision_dynamics: "Decision Dynamics",
  communication_preference: "Communication Preference",
  timing: "Timing",
  service_need: "Service Need",
  concern_or_barrier: "Concern or Barrier",
  financial_consideration: "Financial Consideration",
  community_context: "Community Context",
  operational: "Operational",
  other: "Other",
};

export const RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPES: readonly RelationshipCommitmentResponsiblePartyType[] = [
  "serve",
  "family",
  "resident",
  "community",
  "referral_source",
  "other",
];

export const RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS: Record<
  RelationshipCommitmentResponsiblePartyType,
  string
> = {
  serve: "Serve",
  family: "Family",
  resident: "Resident",
  community: "Community",
  referral_source: "Referral Source",
  other: "Other",
};

export const RELATIONSHIP_ACTION_TYPES: readonly RelationshipActionType[] = [
  "call",
  "email",
  "text",
  "schedule_assessment",
  "complete_assessment",
  "prepare_proposal",
  "send_proposal",
  "follow_up",
  "resident_visit",
  "family_meeting",
  "other",
];

export const RELATIONSHIP_ACTION_TYPE_LABELS: Record<RelationshipActionType, string> = {
  call: "Call",
  email: "Email",
  text: "Text",
  schedule_assessment: "Schedule Assessment",
  complete_assessment: "Complete Assessment",
  prepare_proposal: "Prepare Proposal",
  send_proposal: "Send Proposal",
  follow_up: "Follow Up",
  resident_visit: "Resident Visit",
  family_meeting: "Family Meeting",
  other: "Other",
};

export const RELATIONSHIP_WORKING_NOTE_CATEGORIES: readonly RelationshipWorkingNoteCategory[] = [
  "operational",
  "family",
  "scheduling",
  "sales",
  "clinical",
  "general",
];

export const RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS: Record<
  RelationshipWorkingNoteCategory,
  string
> = {
  operational: "Operational",
  family: "Family",
  scheduling: "Scheduling",
  sales: "Sales",
  clinical: "Clinical",
  general: "General",
};

// Phase 1 primary workflow (Part 2) — the two types the workspace/detail
// UI is built around; other types are representable but don't get
// sales-pipeline-specific treatment.
export const PROSPECT_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "resident_prospect",
  "external_prospect",
];

export function isValidRelationshipType(value: string): value is RelationshipType {
  return (RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

export function isValidRelationshipStage(value: string): value is PipelineStage {
  return (RELATIONSHIP_STAGES as readonly string[]).includes(value);
}

export function isValidRelationshipPriority(value: string): value is RelationshipPriority {
  return (RELATIONSHIP_PRIORITIES as readonly string[]).includes(value);
}

export function isValidTouchType(value: string): value is RelationshipTouchType {
  return (RELATIONSHIP_TOUCH_TYPES as readonly string[]).includes(value);
}

export function isValidInteractionResult(value: string): value is RelationshipInteractionResult {
  return (RELATIONSHIP_INTERACTION_RESULTS as readonly string[]).includes(value);
}

export function isValidInsightCategory(value: string): value is RelationshipInsightCategory {
  return (RELATIONSHIP_INSIGHT_CATEGORIES as readonly string[]).includes(value);
}

export function isValidCommitmentResponsiblePartyType(
  value: string,
): value is RelationshipCommitmentResponsiblePartyType {
  return (RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPES as readonly string[]).includes(value);
}

export function isValidActionType(value: string): value is RelationshipActionType {
  return (RELATIONSHIP_ACTION_TYPES as readonly string[]).includes(value);
}

// Interaction Suggestion Review — see lib/relationships/suggestionEngine.ts
// and docs/architecture/relationship-intelligence-phase-1-implementation.md.

export const RELATIONSHIP_INTERACTION_SUGGESTION_TYPES: readonly RelationshipInteractionSuggestionType[] = [
  "summary",
  "commitment",
  "open_loop",
  "next_action",
  "working_note",
  "service_opportunity",
  "stage_change",
  "resident_need",
];

export const RELATIONSHIP_INTERACTION_SUGGESTION_TYPE_LABELS: Record<RelationshipInteractionSuggestionType, string> = {
  summary: "Summary",
  commitment: "Commitment",
  open_loop: "Open Question",
  next_action: "Next Action",
  working_note: "Working Note",
  service_opportunity: "Service Opportunity",
  stage_change: "Stage Change",
  resident_need: "Resident Need",
};

export const RELATIONSHIP_INTERACTION_SUGGESTION_STATUSES: readonly RelationshipInteractionSuggestionStatus[] = [
  "pending",
  "approved",
  "dismissed",
];

export const RELATIONSHIP_INTERACTION_SUGGESTION_STATUS_LABELS: Record<RelationshipInteractionSuggestionStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  dismissed: "Dismissed",
};

// Residence context for an External Prospect's expected service location
// (Part 4 of the External Prospect domain-model scope) — contextual only,
// never a substitute for the structured postal address.
export const RESIDENCE_TYPES: readonly ResidenceType[] = [
  "private_home",
  "apartment",
  "independent_living",
  "assisted_living",
  "skilled_nursing",
  "family_member_home",
  "other",
];

export const RESIDENCE_TYPE_LABELS: Record<ResidenceType, string> = {
  private_home: "Private Home",
  apartment: "Apartment",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  skilled_nursing: "Skilled Nursing",
  family_member_home: "Family Member's Home",
  other: "Other",
};

export function isValidResidenceType(value: string): value is ResidenceType {
  return (RESIDENCE_TYPES as readonly string[]).includes(value);
}
