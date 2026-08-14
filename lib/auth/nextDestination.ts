// Shared by app/login/page.tsx (server) and components/auth/LoginForm.tsx
// (client) so both apply the exact same open-redirect protection. Only an
// internal, single-segment-rooted path is ever honored — never an absolute
// URL, protocol-relative URL ("//evil.com"), or anything else that could
// send an authenticated session off Serve OS. An invalid or missing value
// always falls back to The People We Serve (/residents), the universal
// default landing destination as of the mobile release (see app/page.tsx).
// Explicit destinations are never overridden — logging in from a
// "next=/workforce" deep link still lands on /workforce; this fallback
// only applies when no explicit destination was requested at all.
export function resolveNextDestination(next: string | null | undefined): string {
  if (!next) return "/residents";
  if (!next.startsWith("/") || next.startsWith("//")) return "/residents";
  return next;
}
