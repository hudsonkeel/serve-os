export const AUTH_ACCESS_COOKIE = "serve_os_access_token";
export const AUTH_REFRESH_COOKIE = "serve_os_refresh_token";
export const AUTH_USER_EMAIL_COOKIE = "serve_os_user_email";

export const AUTHORIZED_EMAIL = "hudson.keel@servecaregiving.com";

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
