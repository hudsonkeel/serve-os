// One-time, local, server-only discovery script for the AxisCare
// read-only API spike. Prints ONLY sanitized metadata (status codes, key
// names, record counts, error categories) — never a raw payload, never
// PHI, never the token.
//
// Run with (do not omit any flag):
//
//   npm run axiscare:discover
//
// which expands to:
//
//   node --env-file-if-exists=.env.local --experimental-strip-types
//        --conditions=react-server scripts/axiscare-discovery.ts
//
// --env-file-if-exists=.env.local  loads the local (gitignored) env file;
//                                   never echoes its contents.
// --experimental-strip-types       lets Node run this .ts file directly
//                                   with no build step or extra toolchain.
// --conditions=react-server        required because
//                                   lib/integrations/axiscare/* uses
//                                   `import "server-only"`, whose default
//                                   (non-react-server) export
//                                   unconditionally throws — that's what
//                                   makes it effective as a Next.js
//                                   client-bundle guard. Next's own
//                                   bundler sets this condition
//                                   automatically; a standalone Node run
//                                   must set it manually, or every import
//                                   in this file will fail immediately.
import { runAxisCareDiscovery } from "../lib/integrations/axiscare/discovery.ts";

function printEndpoint(endpoint: Awaited<ReturnType<typeof runAxisCareDiscovery>>["endpoints"][number]) {
  console.log(`Endpoint: ${endpoint.endpoint}`);
  console.log(`  attempted:      ${endpoint.attempted}`);
  console.log(`  success:        ${endpoint.success}`);
  console.log(`  statusCode:     ${endpoint.statusCode ?? "n/a"}`);
  console.log(`  recordCount:    ${endpoint.recordCount ?? "n/a"}`);
  console.log(`  collectionShape:${endpoint.collectionShape ?? "n/a"}`);
  console.log(`  topLevelKeys:   ${endpoint.topLevelKeys.join(", ") || "(none)"}`);
  console.log(`  resultsKeys:    ${endpoint.resultsKeys.join(", ") || "(none)"}`);
  console.log(`  sampleFields:   ${endpoint.sampleFieldNames.join(", ") || "(none)"}`);
  console.log(`  pagination:     detected=${endpoint.pagination.detected} fields=${endpoint.pagination.fields.join(", ") || "(none)"}`);
  if (endpoint.errorCategory) {
    console.log(`  errorCategory:  ${endpoint.errorCategory}`);
    console.log(`  safeMessage:    ${endpoint.safeMessage}`);
  }
  console.log("");
}

async function main() {
  console.log("AxisCare Read-Only Discovery");
  console.log("=============================");
  console.log("");

  const result = await runAxisCareDiscovery();

  console.log("Configuration:");
  console.log(`  configured:        ${result.configuration.configured}`);
  console.log(`  tokenPresent:      ${result.configuration.tokenPresent}`);
  console.log(`  siteNumberPresent: ${result.configuration.siteNumberPresent}`);
  console.log(`  apiVersionPresent: ${result.configuration.apiVersionPresent}`);
  console.log(`  baseUrlPresent:    ${result.configuration.baseUrlPresent}`);
  console.log(`  baseUrlIsHttps:    ${result.configuration.baseUrlIsHttps}`);
  if (result.configuration.missing.length > 0) {
    console.log(`  missing:           ${result.configuration.missing.join(", ")}`);
  }
  console.log("");

  for (const endpoint of result.endpoints) {
    printEndpoint(endpoint);
  }

  console.log("CINCH provenance field names found (names only, not proof of origin):");
  console.log(
    result.cinchProvenanceFieldNames.length > 0
      ? `  ${result.cinchProvenanceFieldNames.join(", ")}`
      : "  (none found)"
  );
  console.log("");

  const configOrAuthFailed =
    !result.configuration.configured ||
    result.endpoints.some(
      (e) =>
        e.errorCategory === "authentication" || e.errorCategory === "configuration"
    );

  if (configOrAuthFailed) {
    console.error("Discovery could not authenticate or is not configured. Exiting nonzero.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "Unexpected discovery failure:",
    err instanceof Error ? err.message : "unknown error"
  );
  process.exit(1);
});
