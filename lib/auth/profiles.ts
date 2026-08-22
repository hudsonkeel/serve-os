import { createServerClient } from "@/lib/supabase/server";
import { AUTH_ROLES, type AuthRole, isAuthRole } from "./constants";

export interface AuthorizedProfile {
  email: string;
  full_name: string | null;
  role: AuthRole;
  status: "active";
  // Home/default community for this staff member — see
  // supabase/migrations/20260827000000_clarify_user_profile_community_semantics.sql.
  // Default/UI-context only, never an authorization boundary on its own.
  community_id: string | null;
}

export async function getAuthorizedProfileForEmail(
  email: string
): Promise<AuthorizedProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("email,full_name,role,status,community_id")
    .eq("email", normalizedEmail)
    .in("role", AUTH_ROLES)
    .eq("status", "active")
    .maybeSingle<{
      email: string;
      full_name: string | null;
      role: string;
      status: string;
      community_id: string | null;
    }>();

  if (error) {
    console.error("[auth:getAuthorizedProfileForEmail]", error);
    return null;
  }

  if (!data || !isAuthRole(data.role) || data.status !== "active") {
    return null;
  }

  return {
    ...data,
    role: data.role,
    status: "active",
  };
}
