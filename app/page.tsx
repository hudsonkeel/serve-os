import { redirect } from "next/navigation";

// proxy.ts already guarantees an authenticated session reaches this route
// (unauthenticated visits are redirected to /login before this ever runs).
// Today's Work (/workspace) is the universal default landing destination —
// see docs/architecture/SERVE_OS_NAVIGATION_MODEL.md. "How We're Doing"
// (the former root dashboard) moved to its own route, /dashboard, so it
// remains reachable from the sidebar without conflicting with this
// redirect.
export default function RootPage() {
  redirect("/workspace");
}
