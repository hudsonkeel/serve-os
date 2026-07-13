import { createServerClient } from "@/lib/supabase/server";
import {
  ResidentInterest,
  ResidentInterestInsert,
  ResidentMilestone,
  ResidentMilestoneInsert,
  ResidentRelationshipProfile,
  ResidentRelationshipProfileInsert,
  ResidentTouch,
  ResidentTouchInsert,
} from "@/lib/supabase/types";

export interface ResidentConnections {
  profile: ResidentRelationshipProfile | null;
  interests: ResidentInterest[];
  milestones: ResidentMilestone[];
  touches: ResidentTouch[];
}

// Batched lookup of staff-captured "goes by" nicknames (resident_relationship_profiles.preferred_name),
// keyed by resident_id. One query for the full roster instead of one query per resident —
// used by the Residents list so search/display don't trigger an N+1.
export async function getPreferredNamesByResident(): Promise<Map<string, string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_relationship_profiles")
    .select("resident_id, preferred_name")
    .not("preferred_name", "is", null);

  if (error) {
    console.error("[connections:getPreferredNamesByResident:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return new Map();
  }

  const preferredNamesByResident = new Map<string, string>();
  for (const row of data ?? []) {
    const trimmedName = row.preferred_name?.trim();
    if (trimmedName) {
      preferredNamesByResident.set(row.resident_id, trimmedName);
    }
  }

  return preferredNamesByResident;
}

export async function getRelationshipProfile(
  residentId: string
): Promise<ResidentRelationshipProfile | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_relationship_profiles")
    .select("*")
    .eq("resident_id", residentId)
    .maybeSingle<ResidentRelationshipProfile>();

  if (error) {
    console.error("[connections:getRelationshipProfile:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  return data;
}

export async function getActiveInterests(
  residentId: string
): Promise<ResidentInterest[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_interests")
    .select("*")
    .eq("resident_id", residentId)
    .eq("active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[connections:getActiveInterests:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return data ?? [];
}

export async function getMilestones(
  residentId: string
): Promise<ResidentMilestone[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_milestones")
    .select("*")
    .eq("resident_id", residentId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[connections:getMilestones:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return data ?? [];
}

export async function getRecentTouches(
  residentId: string,
  limit = 10
): Promise<ResidentTouch[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_touches")
    .select("*")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[connections:getRecentTouches:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return data ?? [];
}

export async function getResidentConnections(
  residentId: string
): Promise<ResidentConnections> {
  const [profile, interests, milestones, touches] = await Promise.all([
    getRelationshipProfile(residentId),
    getActiveInterests(residentId),
    getMilestones(residentId),
    getRecentTouches(residentId),
  ]);

  return { profile, interests, milestones, touches };
}

export async function upsertRelationshipProfile(
  row: ResidentRelationshipProfileInsert
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("resident_relationship_profiles")
    .upsert(row, { onConflict: "resident_id" });

  if (error) {
    console.error("[connections:upsertRelationshipProfile:error]", {
      residentId: row.resident_id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save relationship profile." };
  }

  return {};
}

export async function createInterest(
  row: ResidentInterestInsert
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_interests")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[connections:createInterest:error]", {
      residentId: row.resident_id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save connection note." };
  }

  return { id: data?.id };
}

export async function createMilestone(
  row: ResidentMilestoneInsert
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_milestones")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[connections:createMilestone:error]", {
      residentId: row.resident_id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save milestone." };
  }

  return { id: data?.id };
}

export async function createTouch(
  row: ResidentTouchInsert
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_touches")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[connections:createTouch:error]", {
      residentId: row.resident_id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save touch." };
  }

  return { id: data?.id };
}
