import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  AUTH_USER_EMAIL_COOKIE,
} from "./constants";
import { getAuthorizedProfileForEmail } from "./profiles";

function createAuthClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getCurrentAuthorizedUser() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value;
  const cookieEmail = cookieStore.get(AUTH_USER_EMAIL_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const supabase = createAuthClient();
  let email: string | undefined;

  if (accessToken) {
    const { data } = await supabase.auth.getUser(accessToken);
    email = data.user?.email ?? undefined;
  }

  if (!email && refreshToken) {
    const { data } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    email = data.user?.email ?? undefined;
  }

  const profile = await getAuthorizedProfileForEmail(email ?? cookieEmail ?? "");
  return profile;
}
