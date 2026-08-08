// Surfaces candidate recruiting-lead ↔ workforce-member pairs for human
// review — never links anyone automatically. Candidate SEARCH (this
// file) is deliberately broader than the deterministic resolution
// engine (lib/recruitingLeads/workforceResolution.ts): it exists only
// to decide what's worth putting in front of a human, using a wide,
// low-precision signal (shared last name), while the engine's own
// exact-match tiers remain the only thing that ever governs whether a
// pair could resolve without full manual review. A human always makes
// the final call through confirm_recruiting_lead_workforce_link.
//
// Concrete motivating case: Alma Dhora Owolabi (recruiting_leads,
// first_name "Alma Dhora") vs Alma Owolabi (workforce_members,
// legal_first_name "Alma") — these do NOT exactly match on full name,
// so the resolution engine correctly reports "No match" on its own;
// last-name search is what actually surfaces this pair for a human to
// look at, exactly per "verify Alma's identity relationship rather
// than assuming the shortened display name is enough."
import "server-only";
import { createServerClient } from "../supabase/server.ts";
import { getEnrichedRecruitingLeads } from "./recruitingLeads.ts";
import { resolveWorkforceStatus } from "../workforce/resolvers.ts";
import { selectPrimaryLink, selectConfirmedLinksForSource } from "../workforce/identityLinkLifecycle.ts";
import {
  evaluateRecruitingToWorkforceResolution,
  type RecruitingResolutionResult,
} from "../recruitingLeads/workforceResolution.ts";
import type { PersonVendorIdentityLink, RecruitingLead, WorkforceMember } from "../supabase/types.ts";
import type { WorkforceLifecycleStatus } from "../workforce/lifecycleStatus.ts";

const NON_TERMINAL_STATUSES = new Set(["new", "contacted", "in_review", "applied"]);

function normalizeLastName(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeFullName(first: string | null, last: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
}

function lastWordOf(value: string): string {
  const parts = value.trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

export interface RecruitingWorkforceCandidatePair {
  readonly lead: RecruitingLead;
  readonly workforceMember: WorkforceMember;
  readonly workforceLifecycleStatus: WorkforceLifecycleStatus | null;
  readonly resolution: RecruitingResolutionResult;
}

export async function getRecruitingWorkforceReviewQueue(): Promise<RecruitingWorkforceCandidatePair[]> {
  const supabase = createServerClient();

  const [{ leads: enrichedLeads }, { data: membersRaw }, { data: linksRaw }, { data: decisionsRaw }] = await Promise.all([
    getEnrichedRecruitingLeads(),
    supabase.from("workforce_members").select("*"),
    supabase.from("person_vendor_identity_links").select("*").eq("subject_type", "workforce_member").eq("source_system", "axiscare"),
    supabase.from("recruiting_lead_workforce_link_decisions").select("recruiting_lead_id, workforce_member_id"),
  ]);

  const members = (membersRaw ?? []) as WorkforceMember[];
  const links = (linksRaw ?? []) as PersonVendorIdentityLink[];
  const linksByMemberId = new Map<string, PersonVendorIdentityLink[]>();
  for (const link of links) {
    const existing = linksByMemberId.get(link.subject_id ?? "") ?? [];
    existing.push(link);
    linksByMemberId.set(link.subject_id ?? "", existing);
  }

  const decidedPairs = new Set(
    ((decisionsRaw ?? []) as { recruiting_lead_id: string; workforce_member_id: string }[]).map(
      (d) => `${d.recruiting_lead_id}:${d.workforce_member_id}`
    )
  );

  const pairs: RecruitingWorkforceCandidatePair[] = [];

  for (const entry of enrichedLeads) {
    // Only unlinked, still-active-pipeline leads are worth surfacing —
    // a lead already linked has nothing to review, and a lead already
    // marked not_a_fit/archived by a human is presumed to be a
    // different, already-settled case, not silently reopened here.
    if (entry.linkedWorkforceMemberId) continue;
    if (!NON_TERMINAL_STATUSES.has(entry.lead.status)) continue;

    const leadLastName = normalizeLastName(entry.lead.last_name);
    if (!leadLastName) continue;

    for (const member of members) {
      if (member.source_recruiting_lead_id) continue; // already linked to a different lead
      const memberLastName =
        normalizeLastName(member.legal_last_name) || lastWordOf(member.display_name.toLowerCase());
      if (memberLastName !== leadLastName) continue;
      if (decidedPairs.has(`${entry.lead.id}:${member.id}`)) continue;

      const primaryLink = selectPrimaryLink(linksByMemberId.get(member.id) ?? [], "axiscare");
      const hasConfirmedActiveAxisCareLink =
        selectConfirmedLinksForSource(linksByMemberId.get(member.id) ?? [], "axiscare").length > 0 &&
        resolveWorkforceStatus(primaryLink).status === "active";

      const resolution = evaluateRecruitingToWorkforceResolution(
        {
          id: entry.lead.id,
          normalizedEmail: entry.lead.email?.trim().toLowerCase() || null,
          normalizedPhone: entry.lead.phone?.replace(/\D/g, "") || null,
          normalizedName: normalizeFullName(entry.lead.first_name, entry.lead.last_name),
          linkedWorkforceMemberId: null,
        },
        {
          workforceMemberId: member.id,
          normalizedEmail: member.primary_email?.trim().toLowerCase() || null,
          normalizedPhone: member.primary_phone?.replace(/\D/g, "") || null,
          normalizedName: normalizeFullName(member.legal_first_name, member.legal_last_name),
          hasConfirmedActiveAxisCareLink,
          // Corroborating-evidence detection from free-text
          // raw_submission notes is not attempted here — too fragile
          // to do safely. A human reviewer reads the same note
          // directly (surfaced in the review queue UI) and judges it
          // themselves rather than this code guessing at it.
          hasCorroboratingEvidence: false,
        }
      );

      pairs.push({
        lead: entry.lead,
        workforceMember: member,
        workforceLifecycleStatus: resolveWorkforceStatus(primaryLink).status,
        resolution,
      });
    }
  }

  return pairs;
}
