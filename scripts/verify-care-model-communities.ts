// Permanent verification script — Phase D.5, care model classification.
// Read-only. Proves, against the live database:
//   1. all three existing Watermere communities resolve to community_care;
//   2. Frisco Lakes and Heritage Ranch resolve to traditional_care;
//   3. residents.community_id / relationships.community_id remain
//      nullable — the structural proof that a future direct-home
//      Traditional Care client is not forced into a fake community.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-care-model-communities.ts
import { createServerClient } from "../lib/supabase/server.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

const EXPECTED: Record<string, "community_care" | "traditional_care"> = {
  watermere_frisco: "community_care",
  watermere_firewheel: "community_care",
  watermere_mckinney: "community_care",
  frisco_lakes: "traditional_care",
  heritage_ranch: "traditional_care",
};

async function main() {
  const supabase = createServerClient();

  const { data: communities, error } = await supabase.from("communities").select("code,name,care_model,is_active");
  if (error || !communities) fail(`Could not read communities: ${error?.message}`);

  for (const [code, expectedCareModel] of Object.entries(EXPECTED)) {
    const row = communities!.find((c) => c.code === code);
    if (!row) fail(`Expected a communities row with code=${code}, found none.`);
    if (row!.care_model !== expectedCareModel) {
      fail(`${code}: expected care_model=${expectedCareModel}, got ${row!.care_model}`);
    }
    console.log(`ok - ${code} -> ${row!.care_model} (${row!.name})`);
  }

  // Structural proof for the direct-home future: these columns must stay
  // nullable. Introspect the live PostgREST OpenAPI spec rather than
  // trust the migration file, since what actually shipped is what
  // matters.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const specRes = await fetch(`${url}/rest/v1/?apikey=${key}`, {
    headers: { Accept: "application/openapi+json", apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await specRes.json();

  for (const table of ["residents", "relationships"] as const) {
    const required: string[] = spec.definitions[table]?.required ?? [];
    if (required.includes("community_id")) {
      fail(`${table}.community_id is required (NOT NULL) in the live schema — a future direct-home client would be forced into a fake community.`);
    }
    console.log(`ok - ${table}.community_id remains nullable in the live schema`);
  }

  console.log("\n=== PASS: care model classification is explicit and correct; no future client is structurally forced into a community. ===");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
