"use server";

import { createServerClient } from "@/lib/supabase/server";
import { ProspectStatus } from "@/lib/supabase/types";

export async function updateProspectStatus(
  id: string,
  status: ProspectStatus
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("prospects")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("[updateProspectStatus]", error.message);
    return { error: "Failed to update status." };
  }

  return {};
}
