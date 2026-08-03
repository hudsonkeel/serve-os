// Candidate matching for AxisCare caregivers against existing Serve
// workforce_members — via each member's linked recruiting_leads contact
// fields (email, phone, name). Never matches on name alone at a confidence
// above 'low' — matches recruiting_lead_vendor_identities' proven
// discipline (decideVendorIdentityAction) verbatim. A candidate found here
// is only ever a *proposal*; nothing in this file confirms a link.
import { createServerClient } from "../supabase/server.ts";
import type { VendorIdentityMatchConfidence, VendorIdentityMatchMethod } from "../supabase/types.ts";

export interface WorkforceMemberCandidate {
  workforceMemberId: string;
  matchMethod: VendorIdentityMatchMethod;
  matchConfidence: VendorIdentityMatchConfidence;
}

async function findWorkforceMemberByRecruitingLeadFilter(
  column: "email" | "phone" | "first_last_name",
  value: string,
  lastName?: string
): Promise<string[]> {
  const supabase = createServerClient();

  let query = supabase.from("recruiting_leads").select("id");
  if (column === "email") {
    query = query.ilike("email", value);
  } else if (column === "phone") {
    query = query.eq("phone", value);
  } else {
    query = query.ilike("first_name", value).ilike("last_name", lastName ?? "");
  }

  const { data: leads, error: leadsError } = await query;
  if (leadsError || !leads || leads.length === 0) return [];

  const leadIds = leads.map((l) => l.id as string);

  const { data: members, error: membersError } = await supabase
    .from("workforce_members")
    .select("id")
    .in("source_recruiting_lead_id", leadIds);

  if (membersError || !members) return [];
  return members.map((m) => m.id as string);
}

export async function findWorkforceMemberCandidateByContact(input: {
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}): Promise<WorkforceMemberCandidate | null> {
  if (input.email) {
    const matches = await findWorkforceMemberByRecruitingLeadFilter("email", input.email);
    if (matches.length === 1) {
      return { workforceMemberId: matches[0], matchMethod: "verified_email", matchConfidence: "high" };
    }
  }

  if (input.phone) {
    const matches = await findWorkforceMemberByRecruitingLeadFilter("phone", input.phone);
    if (matches.length === 1) {
      return { workforceMemberId: matches[0], matchMethod: "verified_phone", matchConfidence: "high" };
    }
  }

  if (input.firstName && input.lastName) {
    const matches = await findWorkforceMemberByRecruitingLeadFilter(
      "first_last_name",
      input.firstName,
      input.lastName
    );
    // Name-only match: never above 'low' confidence, and only ever a
    // proposal — never auto-confirmed. Ambiguous (more than one match)
    // is treated the same as "no candidate" rather than guessing.
    if (matches.length === 1) {
      return { workforceMemberId: matches[0], matchMethod: "name_similarity_pending_review", matchConfidence: "low" };
    }
  }

  return null;
}
