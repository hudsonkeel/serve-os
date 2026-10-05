// Paths the sign-in proxy (proxy.ts) lets through without a user session. Pure (no Next/Supabase
// import) so the list itself is directly testable.
//
// Every /api entry here is a server-to-server machine endpoint that is NEVER a browser session:
// each route verifies its own shared-secret header first and refuses anything else. Being listed
// here only means "not redirected to /login" — it never means "unauthenticated".
export const PUBLIC_PATHS: readonly string[] = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/get-started",
  "/careers",
  // Server-to-server only (Database Webhook + scheduled reconciliation) —
  // never a browser session. Each route verifies its own shared-secret
  // header (INTAKE_INTERNAL_SECRET) rather than relying on cookie auth —
  // see docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md.
  "/api/intake",
  // Same server-to-server pattern, for AxisCare Client Data Sync's
  // scheduled entry point — verifies its own shared-secret header
  // (AXISCARE_SYNC_INTERNAL_SECRET), never cookie auth. See
  // app/api/axiscare/scheduled-sync/route.ts.
  "/api/axiscare/scheduled-sync",
  // Same pattern, for the scheduled assessment-processing dispatcher
  // (netlify/functions/assessment-processing-dispatcher.mts) — verifies its
  // own shared-secret header (ASSESSMENT_PROCESSING_WORKER_SECRET), never
  // cookie auth. Without this entry the proxy 307-redirected every scheduled
  // run to /login, so production's dispatcher never reached the route
  // (merge-readiness B2). See app/api/assessment-processing/dispatch/route.ts.
  "/api/assessment-processing/dispatch",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
