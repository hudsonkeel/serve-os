import { redirect } from "next/navigation";

// proxy.ts already guarantees an authenticated session reaches this route
// (unauthenticated visits are redirected to /login before this ever runs).
//
// The People We Serve (/residents) is the universal default landing
// destination as of the mobile release — a deliberate product decision,
// not a mobile-only branch: the initial mobile Serve OS experience is
// People We Serve, and desktop intentionally shares the same default
// rather than introducing user-agent/device detection to diverge (see
// app/manifest.ts's start_url, which agrees with this route so installed-
// app and browser-default routing never disagree). Today's Work
// (/workspace) remains fully available and unchanged for anyone who
// explicitly navigates there — this only changes what happens with no
// explicit destination. "How We're Doing" (the former root dashboard)
// already lives at its own route, /dashboard, unaffected either way.
export default function RootPage() {
  redirect("/residents");
}
