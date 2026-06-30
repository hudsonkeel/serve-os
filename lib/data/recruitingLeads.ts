import { createServerClient } from "@/lib/supabase/server";
import { RecruitingLead } from "@/lib/supabase/types";

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
