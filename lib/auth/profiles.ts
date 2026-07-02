import { createServerClient } from "@/lib/supabase/server";
import { AUTH_ROLES, type AuthRole, isAuthRole } from "./constants";

export interface AuthorizedProfile {
  email: string;
  full_name: string | null;
  role: AuthRole;
  status: "active";
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
    .select("email,full_name,role,status")
    .eq("email", normalizedEmail)
    .in("role", AUTH_ROLES)
    .eq("status", "active")
    .maybeSingle<{
      email: string;
      full_name: string | null;
      role: string;
      status: string;
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
