import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check .env.local or Vercel Environment Variables.`
    );
  }
  return value;
}

function optionalEnv(name: string): string | null {
  return process.env[name] || null;
}

function getSupabaseProjectRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] || "unknown";
  } catch {
    return "invalid-url";
  }
}

function getSupabaseKeyRole(key: string) {
  const [, payload] = key.split(".");
  if (!payload) {
    return key.startsWith("sb_secret_") ? "secret" : "unknown";
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : "unknown";
  } catch {
    return "unknown";
  }
}

export function getSupabaseServerDiagnostics() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return {
    projectRef: getSupabaseProjectRef(url),
    serviceKeyRole: getSupabaseKeyRole(serviceKey),
    anonKeyRole: anonKey ? getSupabaseKeyRole(anonKey) : "missing",
  };
}

export function createServerClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export function createAnonServerClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
