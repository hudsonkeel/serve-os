// Prints the real, live AxisCare client operational summary — the same
// computation (lifecycle + disposition + identity resolution) a future
// People We Serve UI would read from. Exists so reconciliation checks
// go through the real application code path
// (lib/data/axiscareClientOperationalSummary.ts) instead of being
// re-derived ad hoc on every pass.
//
// Run with: npm run axiscare:client-operational-summary
import { getAxisCareClientOperationalSummary } from "../lib/data/axiscareClientOperationalSummary.ts";

async function main() {
  const summary = await getAxisCareClientOperationalSummary();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
