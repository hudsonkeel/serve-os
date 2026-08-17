// AxisCare Client Data Sync — the daily cron trigger, and NOTHING else.
// This function contains zero sync logic of its own: it exists only
// because Netlify's native Scheduled Functions feature (the smallest
// existing deployment mechanism this app already runs on) can only
// attach a cron schedule to a real Netlify Function, not directly to a
// Next.js Route Handler. All real work — fetch AxisCare, reconcile,
// create evidence — lives entirely in app/api/axiscare/scheduled-sync/
// route.ts (lib/data/axiscareClientSync.ts's syncAllConfirmedResidentsCanonical()),
// the exact same code path "Sync Now" and the post-Confirm-Match trigger
// already use. This file never duplicates that logic — it only calls it
// over HTTP, the same way any other server-to-server caller would.
//
// Netlify Functions v2 scheduling: the exported `config.schedule` below
// is all that's needed — no netlify.toml entry, no extra npm package.
// Standard cron syntax; "0 6 * * *" = 6:00 AM UTC daily (adjust here if
// a different daily time is preferred — cadence lives in this one place,
// not hardcoded into the sync logic itself).
const handler = async () => {
  const secret = process.env.AXISCARE_SYNC_INTERNAL_SECRET;
  if (!secret) {
    console.error("[axiscare-scheduled-sync] AXISCARE_SYNC_INTERNAL_SECRET is not set — skipping this run.");
    return new Response("AXISCARE_SYNC_INTERNAL_SECRET is not configured.", { status: 500 });
  }

  // Netlify injects URL (the site's primary production URL) into every
  // function automatically — never hardcoded here.
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!baseUrl) {
    console.error("[axiscare-scheduled-sync] No site URL available from the Netlify runtime environment.");
    return new Response("No site URL available.", { status: 500 });
  }

  const response = await fetch(`${baseUrl}/api/axiscare/scheduled-sync`, {
    method: "POST",
    headers: { "x-axiscare-sync-internal-secret": secret },
  });

  const body = await response.text();
  console.log(`[axiscare-scheduled-sync] ${response.status} ${body}`);

  return new Response(body, { status: response.status, headers: { "content-type": "application/json" } });
};

export default handler;

export const config = {
  schedule: "0 6 * * *",
};
