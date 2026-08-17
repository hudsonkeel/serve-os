// Audit Readiness's own composition/read layer for the Audit Drill screens
// (app/audit-readiness/drills/*) — the same pattern
// auditReadinessDashboard.ts already established: never touches
// person_requirements/person_evidence directly beyond what's already
// exposed by the owning domain, never introduces a second status
// evaluator. getWorkforceRoster()/getWorkforceMemberProfile() are the same
// functions /workforce's own pages use.
//
// AMENDMENT 1 (audit-time truth): this file's live-status helpers
// (getAuditDrillScopeOptions, getRequirementsForSubject) exist only to
// populate the *active* review experience — deciding what to look at next
// in a session that hasn't recorded that (requirement, subject) pair yet.
// Once an audit_session_item is recorded, that row is the historical
// observation; composeAuditSessionItemView resolves an item's own stored
// fields (requirement_id, evidence_id, corrective_action_id) and never
// recomputes live status for it. The drill pages must not call
// deriveAuditReadinessStatus/getRequirementsForSubject for a
// (requirement, subject) pair that already has a recorded item in the
// session, and must never call it at all when rendering a completed
// session.
import { getWorkforceRoster, getWorkforceMemberProfile } from "../workforce/roster.ts";
import { isEligibleForComplianceFilters } from "../workforce/registrySummary.ts";
import { AUDIT_READINESS_DOMAINS, type AuditReadinessDomainId } from "./auditReadinessDashboard.ts";
import { getRequirementById } from "../data/personRequirements.ts";
import { getPersonEvidenceById } from "../data/personEvidence.ts";
import { getComplianceCorrectiveActionById } from "../data/complianceCorrectiveActions.ts";
import { getAuditSessionItems } from "../data/auditSessions.ts";
import { getCorrectionsForSession, getItemCorrectionsForSession } from "../data/auditSessionCorrections.ts";
import type { RequirementEvaluation } from "./requirementSetStatus.ts";
import type {
  AuditSessionCorrection,
  AuditSessionItem,
  AuditSessionItemCorrection,
  AuditSessionItemFinding,
  AuditSessionItemSubjectType,
  ComplianceCorrectiveAction,
  PersonEvidence,
  PersonRequirement,
  WorkforceComplianceAction,
} from "../supabase/types.ts";

export interface AuditDrillSubjectOption {
  subjectId: string;
  label: string;
  href: string;
}

export interface AuditDrillScopeOption {
  domainId: AuditReadinessDomainId;
  label: string;
  // false = no seeded requirement data / no subject roster exists for this
  // domain yet — the picker must not offer subjects for it, matching the
  // dashboard's own "configured" honesty rule.
  configured: boolean;
  subjects: AuditDrillSubjectOption[];
}

// workforce is the only domain with both seeded requirements and a real
// subject roster today (see the Phase 4 plan's "explicitly out of scope"
// note — emergency_preparedness/client_readiness have neither yet). This
// returns real subjects only where they actually exist; the other two
// domains render honestly empty, not fabricated.
export async function getAuditDrillScopeOptions(): Promise<AuditDrillScopeOption[]> {
  const roster = await getWorkforceRoster();
  const eligibleWorkforce = roster.filter((entry) => isEligibleForComplianceFilters(entry.lifecycle.status));

  return AUDIT_READINESS_DOMAINS.map(({ id, label }) => {
    if (id !== "workforce") {
      return { domainId: id, label, configured: false, subjects: [] };
    }
    return {
      domainId: id,
      label,
      configured: true,
      subjects: eligibleWorkforce.map((entry) => ({
        subjectId: entry.workforceMemberId,
        label: entry.displayName,
        href: `/workforce/${entry.workforceMemberId}`,
      })),
    };
  });
}

// Live requirement evaluations for a subject — used only to populate the
// active-review picker for requirements not yet recorded in the current
// session (amendment 1). Only workforce_member is wired today; other
// subject types return an empty list rather than guessing at a read path
// that doesn't exist yet.
export async function getRequirementsForSubject(
  subjectType: AuditSessionItemSubjectType,
  subjectId: string
): Promise<{ subjectLabel: string; requirements: RequirementEvaluation[]; openComplianceActions: WorkforceComplianceAction[] }> {
  if (subjectType !== "workforce_member") {
    return { subjectLabel: subjectId, requirements: [], openComplianceActions: [] };
  }

  const profile = await getWorkforceMemberProfile(subjectId);
  if (!profile) return { subjectLabel: subjectId, requirements: [], openComplianceActions: [] };

  // employeeRecordAudit.registry (11 requirements) is the audit-readiness-
  // relevant set — not the narrower top-level registry (NAR/EMR only).
  // Same distinction the dashboard's own getWorkforceDomainRollup() already
  // documents and a prior live-verification run already caught getting
  // wrong.
  return {
    subjectLabel: profile.displayName,
    requirements: profile.employeeRecordAudit.registry.requirements,
    openComplianceActions: profile.openComplianceActions,
  };
}

export interface AuditSessionItemView {
  item: AuditSessionItem;
  requirement: PersonRequirement | null;
  evidence: PersonEvidence | null;
  // From audit_session_items.corrective_action_id -> compliance_corrective_actions.
  // That FK structurally excludes workforce_member (see the migration's own
  // subject_type CHECK on compliance_corrective_actions) — always null for
  // a workforce_member item.
  correctiveAction: ComplianceCorrectiveAction | null;
  // Workforce corrective actions live in workforce_compliance_actions, not
  // compliance_corrective_actions, and audit_session_items has no FK into
  // that table at all — resolved instead by matching this item's own
  // (subject, requirement) against the member's open actions, same as the
  // Workforce roster itself does. Only ever populated for workforce_member
  // items; only ever shows an *open* action (a resolved one isn't surfaced
  // here — the item's own recorded finding/notes remain the audit-time
  // record regardless, per amendment 1).
  workforceCorrectiveAction: WorkforceComplianceAction | null;
  subjectLabel: string;
  subjectHref: string | null;
}

// Resolves one recorded audit_session_item's own stored references for
// display — requirement_id -> that exact requirement version (locked once
// relied upon in a completed audit, see
// hasRequirementBeenReliedUponInCompletedAudit), evidence_id -> that
// specific evidence row (not a fresh lookup of the subject's current
// evidence), corrective_action_id -> that corrective action's current
// record (its own lifecycle continuing after the audit is expected, not a
// substitution of the audit finding itself). This performs no live status
// computation — it only resolves labels for what was already recorded.
export async function composeAuditSessionItemView(item: AuditSessionItem): Promise<AuditSessionItemView> {
  const [requirement, evidence, correctiveAction, subject] = await Promise.all([
    getRequirementById(item.requirement_id),
    item.evidence_id ? getPersonEvidenceById(item.evidence_id) : Promise.resolve(null),
    item.corrective_action_id ? getComplianceCorrectiveActionById(item.corrective_action_id) : Promise.resolve(null),
    item.subject_type === "workforce_member" ? getWorkforceMemberProfile(item.subject_id) : Promise.resolve(null),
  ]);

  const workforceCorrectiveAction =
    subject?.openComplianceActions.find((a) => a.requirement_id === item.requirement_id) ?? null;

  return {
    item,
    requirement,
    evidence,
    correctiveAction,
    workforceCorrectiveAction,
    subjectLabel: subject?.displayName ?? item.subject_id,
    subjectHref: item.subject_type === "workforce_member" ? `/workforce/${item.subject_id}` : null,
  };
}

export interface AuditSessionFollowUpSummary {
  openCount: number;
  resolvedCount: number;
  totalCount: number;
}

// "Completed doesn't mean done" — tallies every follow-up action tied to a
// session's own findings (both compliance_corrective_actions, for
// resident/agency/community items, and workforce_compliance_actions,
// matched the same (subject, requirement) way composeAuditSessionItemView
// already does) by status. O(items) per call — deliberately not run for
// every row on a long, unfiltered list without need; callers should only
// call this for sessions they're actually displaying the follow-up count
// for (the drills list and a session's own detail page).
export async function getAuditSessionFollowUpSummary(sessionId: string): Promise<AuditSessionFollowUpSummary> {
  const items = await getAuditSessionItems(sessionId);
  const views = await Promise.all(items.map(composeAuditSessionItemView));

  let openCount = 0;
  let resolvedCount = 0;
  for (const view of views) {
    const action = view.correctiveAction ?? view.workforceCorrectiveAction;
    if (!action) continue;
    if (action.status === "open") openCount += 1;
    else resolvedCount += 1;
  }

  return { openCount, resolvedCount, totalCount: openCount + resolvedCount };
}

export interface CorrectedAuditSessionItemView {
  // Null only for isAdded entries — a correction-only finding with no
  // original audit_session_items row to point back to.
  item: AuditSessionItem | null;
  requirement: PersonRequirement | null;
  evidence: PersonEvidence | null;
  subjectLabel: string;
  subjectHref: string | null;
  // The values to show as *the* finding/notes — the original for an
  // untouched item, the latest correction's new values for a corrected
  // one. Never read for an isRemoved entry (excluded from the effective
  // view entirely; still present here for the history view).
  effectiveFinding: AuditSessionItemFinding | null;
  effectiveNotes: string | null;
  isCorrected: boolean;
  // change_type = 'removed': the original finding was entered in error and
  // should not have been part of the audit — never set because a
  // corrective action was later resolved (this function never reads
  // workforce_compliance_actions/compliance_corrective_actions at all, so
  // that conflation isn't structurally possible here).
  isRemoved: boolean;
  // change_type = 'added': must always render as "Added during
  // correction" — it was never part of the originally completed audit.
  isAdded: boolean;
  latestItemCorrection: AuditSessionItemCorrection | null;
  latestCorrectionEvent: AuditSessionCorrection | null;
}

export interface CorrectedSessionView {
  // Every original item plus every added entry, each flagged — filter on
  // !isRemoved for the effective (corrected-if-corrected) findings list;
  // use the full, unfiltered array for "View Changes" history, where a
  // removed item's original values must still be visible.
  items: CorrectedAuditSessionItemView[];
  // Every correction event for this session, oldest first — the
  // structured diff log. Always available, never summarized away.
  corrections: AuditSessionCorrection[];
  // Every item-level change from every correction event, unfiltered (not
  // just the latest per item like `items` above) — needed to render a full
  // per-event history ("what did THIS specific correction change") rather
  // than only the current effective state.
  itemCorrections: AuditSessionItemCorrection[];
}

// Layers Correction Mode's structured corrections on top of the session's
// immutable original audit_session_items — a pure read-side overlay.
// Nothing here writes to or recomputes audit_session_items; the original
// rows composeAuditSessionItemView resolves are exactly what this function
// starts from. Used only by the completed-session screen — the active-drill
// screen has no corrections yet by construction (corrections only exist for
// completed sessions, enforced by add_audit_session_correction itself).
export async function getCorrectedSessionView(sessionId: string): Promise<CorrectedSessionView> {
  const [rawItems, itemCorrections, corrections] = await Promise.all([
    getAuditSessionItems(sessionId),
    getItemCorrectionsForSession(sessionId),
    getCorrectionsForSession(sessionId),
  ]);

  const correctionById = new Map(corrections.map((c) => [c.id, c]));

  // Latest correction per original item — a finding could in principle be
  // corrected more than once; latest wins for the effective display, every
  // correction remains in `corrections`/`itemCorrections` regardless.
  const latestByOriginalItemId = new Map<string, AuditSessionItemCorrection>();
  const addedCorrections: AuditSessionItemCorrection[] = [];
  for (const ic of itemCorrections) {
    if (ic.audit_session_item_id === null) {
      addedCorrections.push(ic);
      continue;
    }
    const existing = latestByOriginalItemId.get(ic.audit_session_item_id);
    if (!existing || ic.created_at > existing.created_at) {
      latestByOriginalItemId.set(ic.audit_session_item_id, ic);
    }
  }

  const baseViews = await Promise.all(rawItems.map(composeAuditSessionItemView));

  const originalEntries: CorrectedAuditSessionItemView[] = baseViews.map((base) => {
    const latest = latestByOriginalItemId.get(base.item.id) ?? null;
    const isRemoved = latest?.change_type === "removed";
    const isCorrected = latest?.change_type === "edited";
    return {
      item: base.item,
      requirement: base.requirement,
      evidence: base.evidence,
      subjectLabel: base.subjectLabel,
      subjectHref: base.subjectHref,
      effectiveFinding: isCorrected ? latest!.new_finding : base.item.finding,
      effectiveNotes: isCorrected ? latest!.new_notes : base.item.notes,
      isCorrected,
      isRemoved,
      isAdded: false,
      latestItemCorrection: latest,
      latestCorrectionEvent: latest ? (correctionById.get(latest.correction_id) ?? null) : null,
    };
  });

  const addedEntries: CorrectedAuditSessionItemView[] = await Promise.all(
    addedCorrections.map(async (ic) => {
      const [requirement, subject] = await Promise.all([
        getRequirementById(ic.requirement_id),
        ic.subject_type === "workforce_member" ? getWorkforceMemberProfile(ic.subject_id) : Promise.resolve(null),
      ]);
      return {
        item: null,
        requirement,
        evidence: null,
        subjectLabel: subject?.displayName ?? ic.subject_id,
        subjectHref: ic.subject_type === "workforce_member" ? `/workforce/${ic.subject_id}` : null,
        effectiveFinding: ic.new_finding,
        effectiveNotes: ic.new_notes,
        isCorrected: false,
        isRemoved: false,
        isAdded: true,
        latestItemCorrection: ic,
        latestCorrectionEvent: correctionById.get(ic.correction_id) ?? null,
      };
    })
  );

  return { items: [...originalEntries, ...addedEntries], corrections, itemCorrections };
}

export interface ResolvedItemCorrection {
  itemCorrection: AuditSessionItemCorrection;
  requirementName: string;
  subjectLabel: string;
}

// Resolves requirement/subject labels for a "View Changes" history render —
// every item-correction, not just the latest per item (that's what
// getCorrectedSessionView's `items` gives you; this is for the full
// per-correction-event log instead). Small, presentation-only lookups —
// same lookups the rest of this file already does, just applied to every
// historical row rather than only the current effective one.
export async function resolveItemCorrectionDescriptions(
  itemCorrections: readonly AuditSessionItemCorrection[]
): Promise<ResolvedItemCorrection[]> {
  return Promise.all(
    itemCorrections.map(async (ic) => {
      const [requirement, subject] = await Promise.all([
        getRequirementById(ic.requirement_id),
        ic.subject_type === "workforce_member" ? getWorkforceMemberProfile(ic.subject_id) : Promise.resolve(null),
      ]);
      return {
        itemCorrection: ic,
        requirementName: requirement?.name ?? ic.requirement_id,
        subjectLabel: subject?.displayName ?? ic.subject_id,
      };
    })
  );
}
