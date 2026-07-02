"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_COOKIE_OPTIONS,
  AUTH_REFRESH_COOKIE,
  AUTH_USER_EMAIL_COOKIE,
} from "./constants";
import { getAuthorizedProfileForEmail } from "./profiles";

export interface LoginState {
  error?: string;
  success?: boolean;
}

function createAuthClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function genericLoginError() {
  return "Invalid email or password.";
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email) {
    return { error: genericLoginError() };
  }

  if (!password) {
    return { error: genericLoginError() };
  }

  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user.email) {
    console.error("[auth:login:signIn]", error);
    return { error: genericLoginError() };
  }

  const profile = await getAuthorizedProfileForEmail(data.user.email);

  if (!profile) {
    await supabase.auth.signOut();
    console.warn("[auth:login:unauthorized_profile]", {
      email: data.user.email,
    });
    return { error: "You are not authorized to access Serve OS." };
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_ACCESS_COOKIE, data.session.access_token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: data.session.expires_in,
  });
  cookieStore.set(AUTH_REFRESH_COOKIE, data.session.refresh_token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set(AUTH_USER_EMAIL_COOKIE, profile.email, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });

  return { success: true };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_ACCESS_COOKIE);
  cookieStore.delete(AUTH_REFRESH_COOKIE);
  cookieStore.delete(AUTH_USER_EMAIL_COOKIE);
  redirect("/login");
}
