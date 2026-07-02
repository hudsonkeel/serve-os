export const AUTH_ACCESS_COOKIE = "serve_os_access_token";
export const AUTH_REFRESH_COOKIE = "serve_os_refresh_token";
export const AUTH_USER_EMAIL_COOKIE = "serve_os_user_email";

export const AUTH_ROLES = ["admin", "manager", "executive"] as const;
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
