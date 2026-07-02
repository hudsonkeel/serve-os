import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_COOKIE_OPTIONS,
  AUTH_REFRESH_COOKIE,
  AUTH_USER_EMAIL_COOKIE,
  AUTH_ROLES,
  isAuthRole,
} from "@/lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/get-started", "/careers"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  if (request.nextUrl.pathname !== "/") {
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
  }
  return NextResponse.redirect(loginUrl);
}

function createAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function hasAuthorizedProfile(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("email,role,status")
    .eq("email", normalizedEmail)
    .in("role", AUTH_ROLES)
    .eq("status", "active")
    .maybeSingle<{ email: string; role: string; status: string }>();

  if (error) {
    console.error("[auth:proxy:user_profiles]", error);
    return false;
  }

  return Boolean(data?.email && isAuthRole(data.role) && data.status === "active");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return redirectToLogin(request);
  }

  const auth = createAuthClient();
  let email: string | undefined;
  let refreshedAccessToken: string | undefined;
  let refreshedRefreshToken: string | undefined;
  let refreshedExpiresIn: number | undefined;

  if (accessToken) {
    const { data } = await auth.auth.getUser(accessToken);
    email = data.user?.email ?? undefined;
  }

  if (!email && refreshToken) {
    const { data } = await auth.auth.refreshSession({
      refresh_token: refreshToken,
    });
    email = data.user?.email ?? undefined;
    refreshedAccessToken = data.session?.access_token;
    refreshedRefreshToken = data.session?.refresh_token;
    refreshedExpiresIn = data.session?.expires_in;
  }

  if (!email || !(await hasAuthorizedProfile(email))) {
    const response = redirectToLogin(request);
    response.cookies.delete(AUTH_ACCESS_COOKIE);
    response.cookies.delete(AUTH_REFRESH_COOKIE);
    response.cookies.delete(AUTH_USER_EMAIL_COOKIE);
    return response;
  }

  const response = NextResponse.next();

  if (refreshedAccessToken && refreshedExpiresIn) {
    response.cookies.set(AUTH_ACCESS_COOKIE, refreshedAccessToken, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: refreshedExpiresIn,
    });
  }

  if (refreshedRefreshToken) {
    response.cookies.set(AUTH_REFRESH_COOKIE, refreshedRefreshToken, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  response.cookies.set(AUTH_USER_EMAIL_COOKIE, email, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
