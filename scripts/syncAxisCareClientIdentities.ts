// Phase 4 — apply the confirmed AxisCare client -> resident identity
// links. NOT run automatically by anything; a human runs this
// deliberately after supabase/migrations/20260819000000_add_resident_axiscare_client_sync.sql
// has been applied to the live database (this script will fail cleanly
// with a clear PostgREST error otherwise, since sync_axiscare_client_identity
// won't exist yet).
//
// Processes only the deterministic, non-fuzzy confirmed matches from
// docs/architecture/AXISCARE_CLIENT_RECONCILIATION.md (email/phone match
// with agreeing names) — never a fuzzy/name-only match. For each: syncs
// the identity link (creates 'proposed', or refreshes if unchanged/
// already confirmed), then immediately confirms it, since these six were
// already deterministically verified by a prior read-only reconciliation
// pass, not guessed here.
//
// Run with: npm run env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/syncAxisCareClientIdentities.ts
import { createClient } from "@supabase/supabase-js";
import { axisCareGet } from "../lib/integrations/axiscare/client.ts";
import {
  matchAxisCareClientToResident,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeLastName,
  isKnownNonResidentAxisCareClient,
  toPersonVendorIdentityLinksMatchMethod,
  type NormalizedResidentCandidate,
} from "../lib/integrations/axiscare/clientIdentityMatching.ts";

const ACTOR = "AxisCare Client Sync (automated, deterministic matches only)";

// Only the fields this script actually reads — not a full AxisCare
// client type (see lib/integrations/axiscare/types.ts's own note on why
// the full shape stays unenumerated for now).
interface RawAxisCareClient {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  personalEmail?: string | null;
  billingEmail?: string | null;
  homePhone?: string | null;
  mobilePhone?: string | null;
  otherPhone?: string | null;
  community?: { name?: string | null } | null;
  status?: { active?: boolean; label?: string } | null;
  classes?: { code: string; label?: string }[] | null;
  startDate?: string | null;
  effectiveEndDate?: string | null;
}

function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function main() {
  const supabase = createServiceClient();

  const { data: residentsRaw, error: residentsError } = await supabase
    .from("residents")
    .select("id, first_name, last_name, display_name, full_name, email, phone, phone_raw, unit_number, community_name");
  if (residentsError) throw new Error(`Could not load residents: ${residentsError.message}`);

  const residents: NormalizedResidentCandidate[] = (residentsRaw ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name || r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    normalizedEmail: normalizeEmail(r.email),
    normalizedPhones: [r.phone, r.phone_raw].map(normalizePhone).filter((p): p is string => p !== null),
    normalizedName: normalizeName(r.first_name ?? "", r.last_name ?? ""),
    normalizedLastName: r.last_name ? normalizeLastName(r.last_name) : null,
    unitNumber: r.unit_number,
    communityName: r.community_name,
  }));

  const clientsResult = await axisCareGet<{ results?: { clients?: RawAxisCareClient[] } }>("/api/clients", { limit: "100" });
  const clients: RawAxisCareClient[] = clientsResult.body?.results?.clients ?? [];

  let matched = 0, updated = 0, deferred = 0, excluded = 0, errors = 0;
  const results: unknown[] = [];

  for (const c of clients) {
    const normalizedName = normalizeName(c.firstName ?? "", c.lastName ?? "");
    if (isKnownNonResidentAxisCareClient(normalizedName)) {
      excluded++;
      continue;
    }

    const email = normalizeEmail(c.personalEmail ?? c.billingEmail);
    const phones = [c.homePhone, c.mobilePhone, c.otherPhone].map(normalizePhone).filter((p): p is string => p !== null);

    const match = matchAxisCareClientToResident(
      {
        normalizedEmail: email,
        normalizedPhones: phones,
        normalizedName,
        normalizedLastName: c.lastName ? normalizeLastName(c.lastName) : null,
        unitNumber: null,
        communityName: c.community?.name ?? null,
      },
      residents
    );

    // Only exact email/phone matches with agreeing names are processed
    // here — exactly Stage A as scoped for this run. name_and_apartment/
    // name_and_community matches are deterministic too, but this run is
    // deliberately narrower than the module's full matching order;
    // everything else (unmatched, requiresReview, or a name+location-only
    // basis) is left untouched for the admin review queue.
    if (!match.residentId || match.requiresReview || (match.basis !== "email" && match.basis !== "phone")) {
      deferred++;
      continue;
    }

    const approvedSourceData = {
      statusLabel: c.status?.label ?? null,
      statusActive: c.status?.active ?? null,
      classes: (c.classes ?? []).map((cl) => cl.code),
      community: c.community?.name ?? null,
      startDate: c.startDate ?? null,
      effectiveEndDate: c.effectiveEndDate ?? null,
    };

    const { data: syncData, error: syncError } = await supabase
      .rpc("sync_axiscare_client_identity", {
        p_vendor_record_id: String(c.id),
        p_vendor_display_name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        p_match_method: toPersonVendorIdentityLinksMatchMethod(match.basis),
        p_match_confidence: "high",
        p_candidate_subject_id: match.residentId,
        p_approved_source_data: approvedSourceData,
      })
      .single();

    if (syncError || !syncData) {
      errors++;
      results.push({ axiscareId: c.id, error: syncError?.message });
      continue;
    }

    const row = syncData as { action: string; link_id: string; resident_id: string };

    if (row.action === "proposed") {
      // Two overloads of confirm_person_vendor_identity_link are live
      // (20260808000000's 3-arg version and 20260811000000's 5-arg
      // version, which adds p_link_role/p_rationale with defaults).
      // Calling with only the 3 shared named params is ambiguous to
      // PostgREST/Postgres overload resolution — live-confirmed via
      // "Could not choose the best candidate function between...". All 5
      // params must be passed explicitly to select the 5-arg overload
      // unambiguously; p_link_role: "primary" with no p_rationale is the
      // correct shape for this plain first-link flow (20260811000000's
      // own comment: "the plain first-link-as-primary flow keeps its
      // existing, no-rationale-required contract").
      const { error: confirmError } = await supabase.rpc("confirm_person_vendor_identity_link", {
        p_link_id: row.link_id,
        p_subject_id: match.residentId,
        p_actor: ACTOR,
        p_link_role: "primary",
        p_rationale: null,
      });
      if (confirmError) {
        errors++;
        results.push({ axiscareId: c.id, linkId: row.link_id, error: confirmError.message });
        continue;
      }
      matched++;
    } else if (row.action === "refreshed" || row.action === "unchanged") {
      updated++;
    } else {
      deferred++;
    }

    results.push({ axiscareId: c.id, residentId: match.residentId, action: row.action, linkId: row.link_id });
  }

  console.log(JSON.stringify({ matched, updated, deferred, excluded, errors, results }, null, 2));
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
