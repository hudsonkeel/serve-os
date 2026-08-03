// Local, server-only entry point for the AxisCare caregiver roster sync.
// Prints only sanitized counters — never a caregiver name, id, or field
// value. Run with:
//
//   npm run workforce:sync-caregivers
//
// which expands to:
//
//   node --env-file-if-exists=.env.local --experimental-strip-types
//        --conditions=react-server scripts/workforce-sync-caregivers.ts
//
// See scripts/axiscare-discovery.ts for why each flag is required.
import { syncAxisCareCaregivers } from "../lib/workforce/axiscareCaregiverSync.ts";

async function main() {
  console.log("Workforce Intelligence — AxisCare Caregiver Sync");
  console.log("=================================================");
  console.log("");

  const summary = await syncAxisCareCaregivers("script:workforce-sync-caregivers");

  console.log(`Sync run:                 ${summary.syncRunId}`);
  console.log(`Status:                   ${summary.status}`);
  console.log(`Records received:         ${summary.recordsReceived}`);
  console.log(`Source records refreshed: ${summary.sourceRecordsRefreshed}`);
  console.log(`Source records unchanged: ${summary.sourceRecordsUnchanged}`);
  console.log(`Review candidates created:${summary.reviewCandidatesCreated}`);
  console.log(`Skipped existing decisions:${summary.skippedExistingDecisions}`);
  console.log(`Truncated (bound hit):    ${summary.truncated}`);
  console.log(`Errors:                   ${summary.errors.length}`);

  if (summary.errors.length > 0) {
    console.log("");
    console.log("Error detail (vendor record id + safe message only):");
    for (const e of summary.errors) {
      console.log(`  - ${e.vendorRecordId ?? "(unknown)"}: ${e.message}`);
    }
  }

  if (summary.status === "failed") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected sync failure:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
