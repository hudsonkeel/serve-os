// Data layer for axiscare_client_operational_state (see
// supabase/migrations/20260902230000_create_axiscare_client_operational_state.sql).
// Ongoing, roster-wide operational state, refreshed by the daily sync —
// distinct from axiscareClientCanonicalSnapshot.ts's one-time
// demographic bootstrap purpose.
import "server-only";
import { createServerClient } from "../supabase/server.ts";
import type { ServeClientLifecycle } from "../integrations/axiscare/clientLifecycle.ts";
import type { CommunityResolutionSource } from "../integrations/axiscare/communityMapping.ts";
import type { AxisCareIdentityStatus } from "../integrations/axiscare/clientOperationalStatus.ts";
import type { ClientMatchBasis } from "../integrations/axiscare/clientIdentityMatching.ts";
import { isEligibleForCommunityNeedsReview } from "../integrations/axiscare/needsReviewEligibility.ts";
import { getAxisCareClientDispositions } from "./axiscareClientDispositions.ts";
import { listCommunities } from "./communities.ts";
import type { CommunityQueryFilter } from "../auth/communityScope.ts";

export interface AxisCareOperationalStateRow {
  readonly id: string;
  readonly axiscareClientId: string;
  readonly vendorDisplayName: string | null;
  readonly statusActive: boolean;
  readonly statusLabel: string | null;
  readonly classCodes: readonly string[];
  readonly axiscareCommunityId: number | null;
  readonly axiscareCommunityName: string | null;
  readonly startDate: string | null;
  readonly conversionDate: string | null;
  readonly effectiveEndDate: string | null;
  readonly hasContactInfo: boolean;
  readonly resolvedCommunityId: string | null;
  readonly communityResolutionSource: CommunityResolutionSource;
  readonly computedLifecycle: ServeClientLifecycle;
  readonly isPlaceholderRecord: boolean;
  readonly isNameDenylisted: boolean;
  readonly matchedResidentId: string | null;
  readonly identityStatus: AxisCareIdentityStatus;
  readonly matchBasis: ClientMatchBasis | null;
  readonly syncedAt: string;
}

export interface UpsertAxisCareOperationalStateInput {
  readonly axiscareClientId: string;
  readonly vendorDisplayName: string | null;
  readonly statusActive: boolean;
  readonly statusLabel: string | null;
  readonly classCodes: readonly string[];
  readonly axiscareCommunityId: number | null;
  readonly axiscareCommunityName: string | null;
  readonly startDate: string | null;
  readonly conversionDate: string | null;
  readonly effectiveEndDate: string | null;
  readonly hasContactInfo: boolean;
  readonly resolvedCommunityId: string | null;
  readonly communityResolutionSource: CommunityResolutionSource;
  readonly computedLifecycle: ServeClientLifecycle;
  readonly isPlaceholderRecord: boolean;
  readonly isNameDenylisted: boolean;
  readonly matchedResidentId: string | null;
  readonly identityStatus: AxisCareIdentityStatus;
  readonly matchBasis: ClientMatchBasis | null;
}

function toRow(data: Record<string, unknown>): AxisCareOperationalStateRow {
  return {
    id: data.id as string,
    axiscareClientId: data.axiscare_client_id as string,
    vendorDisplayName: data.vendor_display_name as string | null,
    statusActive: data.status_active as boolean,
    statusLabel: data.status_label as string | null,
    classCodes: (data.class_codes as string[] | null) ?? [],
    axiscareCommunityId: data.axiscare_community_id as number | null,
    axiscareCommunityName: data.axiscare_community_name as string | null,
    startDate: data.start_date as string | null,
    conversionDate: data.conversion_date as string | null,
    effectiveEndDate: data.effective_end_date as string | null,
    hasContactInfo: data.has_contact_info as boolean,
    resolvedCommunityId: data.resolved_community_id as string | null,
    communityResolutionSource: data.community_resolution_source as CommunityResolutionSource,
    computedLifecycle: data.computed_lifecycle as ServeClientLifecycle,
    isPlaceholderRecord: data.is_placeholder_record as boolean,
    isNameDenylisted: data.is_name_denylisted as boolean,
    matchedResidentId: data.matched_resident_id as string | null,
    identityStatus: data.identity_status as AxisCareIdentityStatus,
    matchBasis: data.match_basis as ClientMatchBasis | null,
    syncedAt: data.synced_at as string,
  };
}

// Upsert on axiscare_client_id (unique) — sync-run idempotent by
// construction: re-running the sync with unchanged AxisCare data
// produces the same row, not a duplicate.
export async function upsertAxisCareOperationalState(
  input: UpsertAxisCareOperationalStateInput
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("axiscare_client_operational_state")
    .upsert(
      {
        axiscare_client_id: input.axiscareClientId,
        vendor_display_name: input.vendorDisplayName,
        status_active: input.statusActive,
        status_label: input.statusLabel,
        class_codes: input.classCodes,
        axiscare_community_id: input.axiscareCommunityId,
        axiscare_community_name: input.axiscareCommunityName,
        start_date: input.startDate,
        conversion_date: input.conversionDate,
        effective_end_date: input.effectiveEndDate,
        has_contact_info: input.hasContactInfo,
        resolved_community_id: input.resolvedCommunityId,
        community_resolution_source: input.communityResolutionSource,
        computed_lifecycle: input.computedLifecycle,
        is_placeholder_record: input.isPlaceholderRecord,
        is_name_denylisted: input.isNameDenylisted,
        matched_resident_id: input.matchedResidentId,
        identity_status: input.identityStatus,
        match_basis: input.matchBasis,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "axiscare_client_id" }
    );

  if (error) {
    console.error("[axiscareOperationalState:upsert:error]", { axiscareClientId: input.axiscareClientId, message: error.message });
    return { error: "Could not persist AxisCare operational state." };
  }
  return {};
}

export async function getAllAxisCareOperationalState(): Promise<AxisCareOperationalStateRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("axiscare_client_operational_state").select("*");
  if (error) {
    console.error("[axiscareOperationalState:getAll:error]", { message: error.message });
    return [];
  }
  return (data ?? []).map(toRow);
}

// The one function normal /residents and /residents/[id] page reads
// actually need: for a small, already-known set of resident ids, every
// stored operational-state row that matched one of them (could be more
// than one per resident — e.g. a legacy duplicate AxisCare client row —
// same possibility the live path already had to handle; see this
// module's only caller, residentServeRelationships.ts, for the same
// highest-confidence-wins tie-break the live path already used). No
// live AxisCare call, no PHI-dependent re-matching — every match result
// here was already computed and stored at the last sync.
export async function getAxisCareOperationalStateForResidents(
  residentIds: readonly string[]
): Promise<AxisCareOperationalStateRow[]> {
  if (residentIds.length === 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("axiscare_client_operational_state")
    .select("*")
    .in("matched_resident_id", residentIds as string[]);
  if (error) {
    console.error("[axiscareOperationalState:getForResidents:error]", { message: error.message });
    return [];
  }
  return (data ?? []).map(toRow);
}

// Targeted freshness for the one moment staleness matters most: a human
// just confirmed an identity match in Reconciliation
// (confirmAxisCareResidentIdentity). Never a fresh AxisCare fetch — that
// would reintroduce live roster traffic on every confirmation, working
// against the very goal of this phase. Only updates the identity-match
// portion of an ALREADY-stored row (from a prior sync); if no row exists
// yet for this AxisCare client, this is a silent no-op — the next
// scheduled sync creates it with full, correctly-sourced raw data rather
// than this action fabricating a partial row from fields it doesn't have.
export async function updateAxisCareOperationalStateIdentityMatch(input: {
  readonly axiscareClientId: string;
  readonly matchedResidentId: string | null;
  readonly identityStatus: AxisCareIdentityStatus;
  readonly matchBasis: ClientMatchBasis | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("axiscare_client_operational_state")
    .update({
      matched_resident_id: input.matchedResidentId,
      identity_status: input.identityStatus,
      match_basis: input.matchBasis,
      updated_at: new Date().toISOString(),
    })
    .eq("axiscare_client_id", input.axiscareClientId);

  if (error) {
    console.error("[axiscareOperationalState:updateIdentityMatch:error]", { axiscareClientId: input.axiscareClientId, message: error.message });
    return { error: "Could not update the stored AxisCare identity match." };
  }
  return {};
}

export async function getLatestAxisCareOperationalStateSyncedAt(): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("axiscare_client_operational_state")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { synced_at: string }).synced_at;
}

// ─── Unresolved external work — community Needs Review composition ────────
//
// AxisCare Reconciliation + Multi-Source Identity Ingestion phase. A person
// Serve knows about through AxisCare but has not yet resolved to a
// canonical resident (matched_resident_id is null) — real, actionable
// community work, but never a resident, and never a new canonical entity
// type (see needsReviewEligibility.ts's own header comment on why
// lifecycle bucket is not a filter here). Composed into /residents'
// "Needs Review" tab alongside — never merged into — canonical resident
// rows; getResidentServeRelationships() itself stays resident-only so
// every other existing caller (getAuditEligibleActiveClientResidents, etc.)
// is unaffected.
export interface UnresolvedExternalPersonItem {
  readonly source: "axiscare";
  readonly sourceRecordId: string;
  readonly vendorDisplayName: string;
  readonly communityId: string;
  readonly communityName: string;
  readonly lifecycle: ServeClientLifecycle;
}

// mode:"none" -> [] before any query (matches every other community-scoped
// reader's convention, e.g. getCommunityMetrics). mode:"single" -> exactly
// that community's unresolved work. mode:"all" -> every community-resolved
// row across every community (community identity attached so it's never
// ambiguous which community each item belongs to) — rows with NO resolved
// community are excluded even here; they stay solely in the broader
// /reconciliation queue (see needsReviewEligibility.ts).
export async function getUnresolvedAxisCareWorkForCommunity(
  filter: CommunityQueryFilter
): Promise<UnresolvedExternalPersonItem[]> {
  if (filter.mode === "none") return [];

  const supabase = createServerClient();
  let query = supabase
    .from("axiscare_client_operational_state")
    .select(
      "axiscare_client_id, vendor_display_name, resolved_community_id, matched_resident_id, is_placeholder_record, is_name_denylisted, computed_lifecycle"
    )
    .is("matched_resident_id", null);

  if (filter.mode === "single") {
    query = query.eq("resolved_community_id", filter.communityId);
  } else {
    query = query.not("resolved_community_id", "is", null);
  }

  const [{ data, error }, dispositions, communities] = await Promise.all([query, getAxisCareClientDispositions(), listCommunities()]);

  if (error) {
    console.error("[axiscareOperationalState:getUnresolvedWork:error]", { message: error.message });
    return [];
  }

  const communityNameById = new Map(communities.map((c) => [c.id, c.name]));

  const rows = (data ?? []) as {
    axiscare_client_id: string;
    vendor_display_name: string | null;
    resolved_community_id: string | null;
    matched_resident_id: string | null;
    is_placeholder_record: boolean;
    is_name_denylisted: boolean;
    computed_lifecycle: ServeClientLifecycle;
  }[];

  const items: UnresolvedExternalPersonItem[] = [];
  for (const row of rows) {
    const disposition = dispositions.get(row.axiscare_client_id)?.disposition ?? null;
    const eligible = isEligibleForCommunityNeedsReview({
      resolvedCommunityId: row.resolved_community_id,
      matchedResidentId: row.matched_resident_id,
      isPlaceholderRecord: row.is_placeholder_record,
      isNameDenylisted: row.is_name_denylisted,
      disposition,
    });
    if (!eligible) continue;

    // resolved_community_id is guaranteed non-null by isEligibleForCommunityNeedsReview above.
    const communityId = row.resolved_community_id as string;
    items.push({
      source: "axiscare",
      sourceRecordId: row.axiscare_client_id,
      vendorDisplayName: row.vendor_display_name ?? `AxisCare #${row.axiscare_client_id}`,
      communityId,
      communityName: communityNameById.get(communityId) ?? "Unknown community",
      lifecycle: row.computed_lifecycle,
    });
  }

  return items;
}
