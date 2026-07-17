import type {
  RelationshipActionType,
  RelationshipPriority,
  PipelineStage,
  RelationshipStatus,
  RelationshipTouchType,
  RelationshipType,
  RelationshipWorkingNoteCategory,
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
  "assessment",
  "resident_visit",
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

export function isValidActionType(value: string): value is RelationshipActionType {
  return (RELATIONSHIP_ACTION_TYPES as readonly string[]).includes(value);
}

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
