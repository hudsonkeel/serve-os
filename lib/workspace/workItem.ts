// Normalized Work Item — the shared shape every heterogeneous continuity
// source (wellness follow-ups, relationship actions, assessments,
// proposals, recruiting, on-hold relationships, no-next-action
// relationships) is mapped into. See
// docs/architecture/TODAYS_WORK_CONTINUITY.md for the full product
// philosophy and architectural principles this type exists to serve —
// especially "attention should be earned" and "aggregation layer, not a
// system of record."

export type WorkItemSourceType =
  | "relationship_action"
  | "resident_follow_up"
  | "wellness_follow_up"
  | "assessment"
  | "proposal"
  | "recruiting"
  | "other"
  // Governance Connective Slice v0.1 — see lib/workspace/mapping.ts's
  // Incident/Infection/Emergency-Preparedness mappers.
  | "incident"
  | "infection"
  | "compliance_requirement"
  // Today's Work Actionability slice — compliance_corrective_actions,
  // composed independently of whatever Incident/Infection/EPRP requirement
  // created it (see mapCorrectiveActionToWorkItem in mapping.ts). The
  // originating record may resolve/disappear on its own; the corrective
  // Action stays visible under this sourceType until it is itself
  // resolved.
  | "corrective_action";
// "schedule_exception" is intentionally not included — schedule exceptions
// are not wired into the Work Item model this phase; they stay in
// components/scheduling/TodaysSchedulePanel.tsx's own dedicated view. See
// docs/architecture/TODAYS_WORK_CONTINUITY.md's supported-sources table.

export type WorkItemStatus =
  | "needs_attention"
  | "in_progress"
  | "due_today"
  | "upcoming"
  | "waiting"
  | "completed";
// Each value is a section key looked up against WORK_SECTION_CONFIG
// (lib/workspace/sections.ts) — sections are configuration, not a
// hardcoded switch, so a future status value (e.g. "blocked") only needs a
// new config entry, never a rendering-logic change.

export type WorkItemEvidenceType = "explicit" | "deterministic";
// Only these two exist this phase. "likely_interruption"/"recommendation"
// are future-only evidence classes (documented, not implemented) — see
// docs/architecture/TODAYS_WORK_CONTINUITY.md.

export type WorkItemPriority = "low" | "normal" | "high" | "urgent";

export interface WorkItem {
  readonly id: string;
  readonly sourceType: WorkItemSourceType;
  readonly title: string;
  readonly description?: string;
  readonly status: WorkItemStatus;
  readonly evidenceType: WorkItemEvidenceType;
  readonly priority?: WorkItemPriority;
  readonly dueAt?: string;
  readonly completedAt?: string;
  // Free-text match key against the current user's email/full name — never
  // a real uuid. See lib/workspace/ownership.ts for why.
  readonly ownerId?: string;
  readonly ownerLabel?: string;
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly subjectLabel?: string;
  // Always a real, clickable link back to the source record — Today's Work
  // never becomes the system of record for this work.
  readonly sourceRoute: string;
  readonly recommendedNextStep?: string;
  // Required, not optional — every item must be able to answer "why is
  // this here?" Never a vague, evidence-free warning.
  readonly explanation: string;
}
