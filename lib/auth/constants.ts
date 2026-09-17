export const AUTH_ACCESS_COOKIE = "serve_os_access_token";
export const AUTH_REFRESH_COOKIE = "serve_os_refresh_token";
export const AUTH_USER_EMAIL_COOKIE = "serve_os_user_email";
// Current-community context (Phase D) — server-visible, not a session/auth
// token, but reuses AUTH_COOKIE_OPTIONS below for the same httpOnly/
// sameSite/secure discipline as the real auth cookies.
export const CURRENT_COMMUNITY_COOKIE = "serve_os_current_community";

// office_staff (v0.1, "Serve OS User Roles & Permissions"): ordinary
// personnel-document administration (view caregiver profiles, view/upload/
// replace caregiver documents) without compliance decision authority or
// any admin capability. See lib/workforce/permissions.ts for exactly what
// it can and cannot do.
export const AUTH_ROLES = ["admin", "manager", "executive", "operations", "office_staff"] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

export function isAuthRole(role: string | null | undefined): role is AuthRole {
  return Boolean(role && (AUTH_ROLES as readonly string[]).includes(role));
}

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
