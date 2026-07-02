import { createServerClient } from "@/lib/supabase/server";
import { AUTHORIZED_EMAIL } from "./constants";

export interface AuthorizedProfile {
  email: string;
  full_name: string | null;
  role: "admin";
  status: "active";
}

export async function getAuthorizedProfileForEmail(
  email: string
): Promise<AuthorizedProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail !== AUTHORIZED_EMAIL) {
    return null;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("email,full_name,role,status")
    .eq("email", normalizedEmail)
    .eq("role", "admin")
    .eq("status", "active")
    .maybeSingle<AuthorizedProfile>();

  if (error) {
    console.error("[auth:getAuthorizedProfileForEmail]", error);
    return null;
  }

  return data;
}
