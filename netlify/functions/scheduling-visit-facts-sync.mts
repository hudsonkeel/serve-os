// Historical Visit Fact Rolling Sync — the daily cron trigger, and
// NOTHING else. This function contains zero sync logic of its own — the
// same split netlify/functions/axiscare-scheduled-sync.mts already
// established: all real work (compute the rolling window, fetch AxisCare,
// normalize, resolve identity, ingest Historical Facts, run ID-stability
// diagnostics) lives entirely in
// app/api/scheduling/visit-facts-sync/route.ts
// (lib/scheduling/visitFactsRollingSync.ts's runRollingVisitFactsSync()),
// the exact same code path a manual dry run already uses. This file never
// duplicates that logic — it only calls it over HTTP.
//
// NOT YET ACTIVE IN PRODUCTION. This file exists in code, on an unmerged
// branch. Netlify Scheduled Functions only take effect once deployed —
// merging and deploying this branch is a separate, explicit decision;
// committing this file does not itself activate anything. See the
// Deployment Gate section of the pre-commit report for what Hud must
// review and approve before the schedule below actually starts running.
//
// Netlify Functions v2 scheduling: the exported `config.schedule` below
// is all that's needed — no netlify.toml entry, no extra npm package.
// "0 7 * * *" = 7:00 AM UTC daily, deliberately one hour after the
// existing AxisCare client/community sync (6:00 AM UTC) so resident and
// Community identity resolution is fresh before this sync tries to use
// it — see lib/data/axiscareOperationalState.ts's
// getResidentMatchesByAxisCareClientIds().
const handler = async () => {
  const secret = process.env.SCHEDULING_VISIT_SYNC_INTERNAL_SECRET;
  if (!secret) {
    console.error("[scheduling-visit-facts-sync] SCHEDULING_VISIT_SYNC_INTERNAL_SECRET is not set — skipping this run.");
    return new Response("SCHEDULING_VISIT_SYNC_INTERNAL_SECRET is not configured.", { status: 500 });
  }

  // Netlify injects URL (the site's primary production URL) into every
  // function automatically — never hardcoded here.
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!baseUrl) {
    console.error("[scheduling-visit-facts-sync] No site URL available from the Netlify runtime environment.");
    return new Response("No site URL available.", { status: 500 });
  }

  const response = await fetch(`${baseUrl}/api/scheduling/visit-facts-sync`, {
    method: "POST",
    headers: { "x-scheduling-visit-sync-internal-secret": secret },
  });

  const body = await response.text();
  console.log(`[scheduling-visit-facts-sync] ${response.status} ${body}`);

  return new Response(body, { status: response.status, headers: { "content-type": "application/json" } });
};

export default handler;

export const config = {
  schedule: "0 7 * * *",
};
