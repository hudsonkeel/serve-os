// Workforce Intelligence's own read model — composes the platform data
// layer (workforce_members, person_vendor_identity_links, person_documents,
// person_evidence, workforce_activity) into the shapes the Workforce UI
// actually needs. This is Domain Interpretation, not platform logic — see
// lib/compliance/requirementSetStatus.ts for the shared layer this builds
// on.
import { createServerClient } from "../supabase/server.ts";
import { listWorkforceMembers, getWorkforceMemberById } from "../data/workforceMembers.ts";
import { getPersonVendorIdentityLinksForSubject } from "../data/personVendorIdentityLinks.ts";
import { getPersonDocumentsForSubject } from "../data/personDocuments.ts";
import { getPersonEvidenceForSubject } from "../data/personEvidence.ts";
import { getWorkforceActivity } from "../data/workforceActivity.ts";
import { getCommunityMembershipsForMember } from "../data/workforceCommunityMemberships.ts";
import { getWorkforceProfileChangeHistory } from "../data/workforceProfileChanges.ts";
import { getOpenWorkforceProfileDiscrepancies } from "../data/workforceProfileDiscrepancies.ts";
import { getRegistryReadinessForWorkforceMember } from "./registryReadiness.ts";
import { getEmployeeRecordAuditEvaluation, type EmployeeRecordAuditEvaluation } from "./employeeRecordAuditReadiness.ts";
import { getAllOpenComplianceActions, getOpenComplianceActionsForMember } from "../data/workforceComplianceActions.ts";
import { deriveAttentionState, type AttentionEvaluation } from "./attentionState.ts";
import type { WorkforceLifecycleEvaluation } from "./lifecycleStatus.ts";
import { selectConfirmedLinksForSource, selectPrimaryLink } from "./identityLinkLifecycle.ts";
import { resolveWorkforceDisplayName, resolveWorkforceStatus } from "./resolvers.ts";
import type { RequirementSetEvaluation } from "../compliance/requirementSetStatus.ts";
import {
  SUBJECT_TYPE_WORKFORCE_MEMBER,
  type PersonDocument,
  type PersonEvidence,
  type PersonVendorIdentityLink,
  type WorkforceActivityEvent,
  type WorkforceComplianceAction,
  type WorkforceCommunityMembership,
  type WorkforceMember,
  type WorkforceProfileChange,
  type WorkforceProfileDiscrepancy,
} from "../supabase/types.ts";

// Highest priority first — used to pick the single "Next Action" a roster
// row surfaces out of a member's possibly-several open actions.
const PRIORITY_RANK: Record<WorkforceComplianceAction["priority"], number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

function highestPriorityAction(actions: WorkforceComplianceAction[]): WorkforceComplianceAction | null {
  if (actions.length === 0) return null;
  return actions.slice().sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])[0];
}

export interface WorkforceRosterEntry {
  workforceMemberId: string;
  displayName: string;
  axisCareActive: boolean | null;
  axisCareStatusLabel: string | null;
  axisCareLinked: boolean;
  lastSyncedAt: string | null;
  registry: RequirementSetEvaluation;
  lifecycle: WorkforceLifecycleEvaluation;
  employeeRecordAudit: EmployeeRecordAuditEvaluation;
  attentionState: AttentionEvaluation;
  openActions: WorkforceComplianceAction[];
  nextAction: WorkforceComplianceAction | null;
}

// Routes through the shared resolver (lib/workforce/resolvers.ts) —
// member.display_name (DB-enforced non-null) is always the effective
// source in practice. The recruiting-lead join below is a DEFENSIVE
// fallback only, for a row that somehow predates that guarantee; it must
// never become the intended source of truth again (that was exactly the
// "Unnamed workforce member" bug 20260812000000 fixed).
async function resolveDisplayName(
  member: WorkforceMember,
  axiscareLink: PersonVendorIdentityLink | null
): Promise<string> {
  const resolved = resolveWorkforceDisplayName(member, { primaryVendorIdentity: axiscareLink });
  if (resolved !== "Unnamed workforce member") return resolved;

  console.error(
    `[resolveDisplayName] workforce_members ${member.id} has no usable name anywhere — falling back to a recruiting-lead join. This should not happen; investigate how this row was created.`
  );

  if (member.source_recruiting_lead_id) {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("recruiting_leads")
      .select("first_name, last_name")
      .eq("id", member.source_recruiting_lead_id)
      .maybeSingle();
    if (data && (data.first_name || data.last_name)) {
      return [data.first_name, data.last_name].filter(Boolean).join(" ");
    }
  }

  return "Unnamed workforce member";
}

// The primary AxisCare identity drives the Workforce profile's display
// fields and derived lifecycle status (Vendor Identity Lineage requirement
// 3) — a duplicate/retired confirmed link never overwrites current profile
// presentation. See
// supabase/migrations/20260811000000_add_vendor_identity_lineage.sql.
async function getConfirmedAxisCareLink(workforceMemberId: string): Promise<PersonVendorIdentityLink | null> {
  const links = await getPersonVendorIdentityLinksForSubject(SUBJECT_TYPE_WORKFORCE_MEMBER, workforceMemberId);
  return selectPrimaryLink(links, "axiscare");
}

// All confirmed AxisCare links (primary, duplicate, retired, historical) —
// the "Source Identities" section shows every one of these, since none is
// ever deleted or merged away.
async function getAllConfirmedAxisCareLinks(workforceMemberId: string): Promise<PersonVendorIdentityLink[]> {
  const links = await getPersonVendorIdentityLinksForSubject(SUBJECT_TYPE_WORKFORCE_MEMBER, workforceMemberId);
  return selectConfirmedLinksForSource(links, "axiscare");
}

export async function getWorkforceRoster(): Promise<WorkforceRosterEntry[]> {
  const [members, allOpenActions] = await Promise.all([listWorkforceMembers(), getAllOpenComplianceActions()]);

  const openActionsByMember = new Map<string, WorkforceComplianceAction[]>();
  for (const action of allOpenActions) {
    const existing = openActionsByMember.get(action.workforce_member_id);
    if (existing) existing.push(action);
    else openActionsByMember.set(action.workforce_member_id, [action]);
  }

  return Promise.all(
    members.map(async (member) => {
      const [axiscareLink, registry] = await Promise.all([
        getConfirmedAxisCareLink(member.id),
        getRegistryReadinessForWorkforceMember(member.id),
      ]);

      const displayName = await resolveDisplayName(member, axiscareLink);
      const sourceData = axiscareLink?.approved_source_data as
        | { statusActive?: boolean | null; statusLabel?: string | null }
        | undefined;
      const lifecycle = resolveWorkforceStatus(axiscareLink);
      const employeeRecordAudit = await getEmployeeRecordAuditEvaluation(member.id, lifecycle.status);
      const attentionState = deriveAttentionState(lifecycle.status, employeeRecordAudit.registry.requirements);
      const openActions = openActionsByMember.get(member.id) ?? [];

      return {
        workforceMemberId: member.id,
        displayName,
        axisCareActive: sourceData?.statusActive ?? null,
        axisCareStatusLabel: sourceData?.statusLabel ?? null,
        axisCareLinked: Boolean(axiscareLink),
        lastSyncedAt: axiscareLink?.last_synced_at ?? null,
        registry,
        lifecycle,
        employeeRecordAudit,
        attentionState,
        openActions,
        nextAction: highestPriorityAction(openActions),
      };
    })
  );
}

// Lightweight name resolution for contexts (like the identity review queue)
// that only need a label, not the full profile.
export async function getWorkforceMemberDisplayName(workforceMemberId: string): Promise<string | null> {
  const member = await getWorkforceMemberById(workforceMemberId);
  if (!member) return null;
  const axiscareLink = await getConfirmedAxisCareLink(workforceMemberId);
  return resolveDisplayName(member, axiscareLink);
}

export interface WorkforceMemberProfile {
  member: WorkforceMember;
  displayName: string;
  axiscareLink: PersonVendorIdentityLink | null;
  // All confirmed AxisCare links for this member (primary + duplicate +
  // retired + historical) — for the Source Identities section. Includes
  // axiscareLink itself when one exists.
  sourceIdentities: PersonVendorIdentityLink[];
  documents: PersonDocument[];
  evidence: PersonEvidence[];
  activity: WorkforceActivityEvent[];
  registry: RequirementSetEvaluation;
  lifecycle: WorkforceLifecycleEvaluation;
  // Canonical Profile Editor additions — see
  // supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
  communityMemberships: WorkforceCommunityMembership[];
  profileChangeHistory: WorkforceProfileChange[];
  openDiscrepancies: WorkforceProfileDiscrepancy[];
  // Employee Record Audit — see
  // supabase/migrations/20260814000000_add_employee_record_audit.sql.
  employeeRecordAudit: EmployeeRecordAuditEvaluation;
  attentionState: AttentionEvaluation;
  openComplianceActions: WorkforceComplianceAction[];
  nextAction: WorkforceComplianceAction | null;
}

export async function getWorkforceMemberProfile(workforceMemberId: string): Promise<WorkforceMemberProfile | null> {
  const member = await getWorkforceMemberById(workforceMemberId);
  if (!member) return null;

  const [
    axiscareLink,
    sourceIdentities,
    documents,
    evidence,
    activity,
    registry,
    communityMemberships,
    profileChangeHistory,
    openDiscrepancies,
    openComplianceActions,
  ] = await Promise.all([
    getConfirmedAxisCareLink(workforceMemberId),
    getAllConfirmedAxisCareLinks(workforceMemberId),
    getPersonDocumentsForSubject(SUBJECT_TYPE_WORKFORCE_MEMBER, workforceMemberId),
    getPersonEvidenceForSubject(SUBJECT_TYPE_WORKFORCE_MEMBER, workforceMemberId),
    getWorkforceActivity(workforceMemberId),
    getRegistryReadinessForWorkforceMember(workforceMemberId),
    getCommunityMembershipsForMember(workforceMemberId),
    getWorkforceProfileChangeHistory(workforceMemberId),
    getOpenWorkforceProfileDiscrepancies(workforceMemberId),
    getOpenComplianceActionsForMember(workforceMemberId),
  ]);

  const displayName = await resolveDisplayName(member, axiscareLink);
  const lifecycle = resolveWorkforceStatus(axiscareLink);
  const employeeRecordAudit = await getEmployeeRecordAuditEvaluation(workforceMemberId, lifecycle.status);
  const attentionState = deriveAttentionState(lifecycle.status, employeeRecordAudit.registry.requirements);

  return {
    member,
    displayName,
    axiscareLink,
    sourceIdentities,
    documents,
    evidence,
    activity,
    registry,
    lifecycle,
    communityMemberships,
    profileChangeHistory,
    openDiscrepancies,
    employeeRecordAudit,
    attentionState,
    openComplianceActions,
    nextAction: highestPriorityAction(openComplianceActions),
  };
}
