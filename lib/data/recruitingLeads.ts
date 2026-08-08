// Relative imports with explicit .ts extensions (not the "@/" alias) so
// this file is callable both from the Next.js app and from a plain
// `node --experimental-strip-types` script (the Recruiting Lead Flight
// collector — see scripts/collectors/recruitingLeadFlight.ts) — matching
// the fix already applied to lib/data/relationships.ts for the same reason.
import { createServerClient } from "../supabase/server.ts";
import type { RecruitingLead } from "../supabase/types.ts";
import { resolveWorkforceStatus } from "../workforce/resolvers.ts";
import { selectPrimaryLink } from "../workforce/identityLinkLifecycle.ts";
import { deriveEffectiveRecruitingStatus, type EffectiveRecruitingStatusResult } from "../recruitingLeads/pipelineStatus.ts";
import type { PersonVendorIdentityLink } from "../supabase/types.ts";

export async function getRecruitingLeads(): Promise<{
  leads: RecruitingLead[];
  error: string | null;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getRecruitingLeads]", error);
    return { leads: [], error: error.message };
  }

  return { leads: (data ?? []) as RecruitingLead[], error: null };
}

export async function getRecruitingLeadById(id: string): Promise<RecruitingLead | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getRecruitingLeadById]", { id, message: error.message });
    return null;
  }

  return (data as RecruitingLead | null) ?? null;
}

// Used by the Recruiting Lead Flight collector to resolve --email into a
// single, unambiguous lead before any vendor search is allowed to begin
// (docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md §1/§9). Returns null on
// zero OR more than one match — the caller must never guess which lead an
// ambiguous email refers to.
export async function getRecruitingLeadByApprovedEmail(email: string): Promise<RecruitingLead | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_leads")
    .select("*")
    .eq("email", email);

  if (error) {
    console.error("[getRecruitingLeadByApprovedEmail]", { message: error.message });
    return null;
  }

  const rows = (data ?? []) as RecruitingLead[];
  return rows.length === 1 ? rows[0] : null;
}

export interface EnrichedRecruitingLead {
  readonly lead: RecruitingLead;
  readonly effectiveStatus: EffectiveRecruitingStatusResult["effectiveStatus"];
  readonly isDerivedFromWorkforceLink: boolean;
  readonly linkedWorkforceMemberId: string | null;
}

// Joins recruiting_leads with workforce_members (via the previously-
// never-written source_recruiting_lead_id — see
// supabase/migrations/20260829000000_add_recruiting_lead_workforce_link.sql)
// and each linked member's confirmed AxisCare lifecycle, applying
// deriveEffectiveRecruitingStatus() per lead. This is the one place the
// Recruiting UI should read pipeline status from — never lead.status
// directly, which is stored history, not necessarily current truth.
export async function getEnrichedRecruitingLeads(): Promise<{
  leads: EnrichedRecruitingLead[];
  error: string | null;
}> {
  const supabase = createServerClient();

  const [{ data: leadsRaw, error: leadsError }, { data: membersRaw, error: membersError }, { data: linksRaw, error: linksError }] =
    await Promise.all([
      supabase.from("recruiting_leads").select("*").order("created_at", { ascending: false }),
      supabase.from("workforce_members").select("id, source_recruiting_lead_id").not("source_recruiting_lead_id", "is", null),
      supabase.from("person_vendor_identity_links").select("*").eq("subject_type", "workforce_member").eq("source_system", "axiscare"),
    ]);

  if (leadsError) {
    console.error("[getEnrichedRecruitingLeads]", leadsError);
    return { leads: [], error: leadsError.message };
  }

  const memberIdByLeadId = new Map<string, string>();
  for (const m of (membersRaw ?? []) as { id: string; source_recruiting_lead_id: string | null }[]) {
    if (m.source_recruiting_lead_id) memberIdByLeadId.set(m.source_recruiting_lead_id, m.id);
  }

  const linksByMemberId = new Map<string, PersonVendorIdentityLink[]>();
  if (!membersError && !linksError) {
    for (const link of (linksRaw ?? []) as PersonVendorIdentityLink[]) {
      const existing = linksByMemberId.get(link.subject_id ?? "") ?? [];
      existing.push(link);
      linksByMemberId.set(link.subject_id ?? "", existing);
    }
  }

  const leads: EnrichedRecruitingLead[] = ((leadsRaw ?? []) as RecruitingLead[]).map((lead) => {
    const linkedWorkforceMemberId = memberIdByLeadId.get(lead.id) ?? null;
    const primaryLink = linkedWorkforceMemberId
      ? selectPrimaryLink(linksByMemberId.get(linkedWorkforceMemberId) ?? [], "axiscare")
      : null;
    const lifecycle = linkedWorkforceMemberId ? resolveWorkforceStatus(primaryLink) : null;
    const { effectiveStatus, isDerivedFromWorkforceLink } = deriveEffectiveRecruitingStatus(
      lead.status,
      lifecycle?.status ?? null
    );

    return { lead, effectiveStatus, isDerivedFromWorkforceLink, linkedWorkforceMemberId };
  });

  return { leads, error: null };
}
