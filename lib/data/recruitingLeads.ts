// Relative imports with explicit .ts extensions (not the "@/" alias) so
// this file is callable both from the Next.js app and from a plain
// `node --experimental-strip-types` script (the Recruiting Lead Flight
// collector — see scripts/collectors/recruitingLeadFlight.ts) — matching
// the fix already applied to lib/data/relationships.ts for the same reason.
import { createServerClient } from "../supabase/server.ts";
import type { RecruitingLead } from "../supabase/types.ts";

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
