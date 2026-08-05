// Shared by app/login/page.tsx (server) and components/auth/LoginForm.tsx
// (client) so both apply the exact same open-redirect protection. Only an
// internal, single-segment-rooted path is ever honored — never an absolute
// URL, protocol-relative URL ("//evil.com"), or anything else that could
// send an authenticated session off Serve OS. An invalid or missing value
// always falls back to Today's Work, the universal default landing
// destination.
export function resolveNextDestination(next: string | null | undefined): string {
  if (!next) return "/workspace";
  if (!next.startsWith("/") || next.startsWith("//")) return "/workspace";
  return next;
}
