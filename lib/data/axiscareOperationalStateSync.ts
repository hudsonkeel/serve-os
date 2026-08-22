// AxisCare operational-state sync — the one place a live AxisCare roster
// call happens for operational-state purposes. One getAllClients() call
// per run (AxisCare Community Mapping + Operational State phase, section
// 10: "one roster fetch should update every mapped community in the
// same run" — there is one AxisCare tenant, never a per-community job).
//
// Reuses the EXISTING identity-matching machinery unchanged
// (buildAxisCareMatchCandidates, matchAxisCareClientToResident,
// resolveAxisCareResidentMatch, isKnownNonResidentAxisCareClient) — this
// is not a redesign of reconciliation matching, only a relocation of
// WHEN it runs (once daily, at sync time) and WHAT gets kept afterward
// (the match result, never the raw contact info it was computed from).
import "server-only";
import { createServerClient } from "../supabase/server.ts";
import { getAllClients } from "../integrations/axiscare/clients.ts";
import { buildAxisCareMatchCandidates } from "./axiscareClientOperationalSummary.ts";
import {
  matchAxisCareClientToResident,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeLastName,
  isKnownNonResidentAxisCareClient,
  type ClientMatchBasis,
} from "../integrations/axiscare/clientIdentityMatching.ts";
import { classifyAxisCareClientLifecycle } from "../integrations/axiscare/clientLifecycle.ts";
import { resolveAxisCareResidentMatch } from "../integrations/axiscare/clientOperationalStatus.ts";
import { resolveAxisCareCommunityCode } from "../integrations/axiscare/communityMapping.ts";
import { isAxisCareCommunityPlaceholderRecord } from "../integrations/axiscare/placeholderRecords.ts";
import { upsertAxisCareOperationalState } from "./axiscareOperationalState.ts";
import { listCommunities } from "./communities.ts";

interface RawAxisCareClient {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  personalEmail?: string | null;
  billingEmail?: string | null;
  homePhone?: string | null;
  mobilePhone?: string | null;
  otherPhone?: string | null;
  community?: { id?: number | null; name?: string | null } | null;
  status?: { active?: boolean; label?: string } | null;
  classes?: { code: string; label?: string }[] | null;
  startDate?: string | null;
  conversionDate?: string | null;
  effectiveEndDate?: string | null;
}

export interface AxisCareOperationalStateSyncResult {
  readonly totalRosterRecords: number;
  readonly persisted: number;
  readonly failed: number;
  readonly communityResolved: number;
  readonly communityUnresolved: number;
  readonly placeholdersExcluded: readonly string[];
  readonly matchedResidentCount: number;
}

export async function syncAxisCareOperationalState(): Promise<AxisCareOperationalStateSyncResult> {
  const supabase = createServerClient();

  const [clientsResult, { data: residentsRaw }, { data: existingLinksRaw }, { data: redirectsRaw }, { data: aliasesRaw }, communities] =
    await Promise.all([
      getAllClients(),
      supabase
        .from("residents")
        .select("id, first_name, last_name, display_name, full_name, email, phone, phone_raw, unit_number, community_name"),
      supabase.from("person_vendor_identity_links").select("*").eq("subject_type", "resident").eq("source_system", "axiscare"),
      supabase.from("resident_identity_redirects").select("duplicate_resident_id, canonical_resident_id"),
      supabase.from("resident_identity_aliases").select("canonical_resident_id, normalized_value"),
      listCommunities(),
    ]);

  const communityIdByCode = new Map(communities.map((c) => [c.code, c.id]));
  const residentCandidates = buildAxisCareMatchCandidates(residentsRaw ?? [], redirectsRaw ?? [], aliasesRaw ?? []);
  const existingLinks = new Map(
    (existingLinksRaw ?? []).map((l) => [String(l.vendor_record_id), l as { subject_id: string | null; status: string }])
  );

  let persisted = 0;
  let failed = 0;
  let communityResolved = 0;
  let communityUnresolved = 0;
  const placeholdersExcluded: string[] = [];
  let matchedResidentCount = 0;

  for (const raw of clientsResult.records as RawAxisCareClient[]) {
    const c = raw;
    const axiscareId = String(c.id);
    const classCodes = (c.classes ?? []).map((cl) => cl.code);
    const isPlaceholder = isAxisCareCommunityPlaceholderRecord({ lastName: c.lastName ?? null });
    if (isPlaceholder) placeholdersExcluded.push(axiscareId);

    const communityResolution = resolveAxisCareCommunityCode({
      communityId: c.community?.id ?? null,
      communityName: c.community?.name ?? null,
      classCodes,
    });
    if (communityResolution.communityCode) communityResolved++;
    else communityUnresolved++;
    const resolvedCommunityId = communityResolution.communityCode
      ? (communityIdByCode.get(communityResolution.communityCode) ?? null)
      : null;

    const email = normalizeEmail(c.personalEmail ?? c.billingEmail);
    const phones = [c.homePhone, c.mobilePhone, c.otherPhone].map(normalizePhone).filter((p): p is string => p !== null);
    const hasContactInfo = !!(email || phones.length);
    const hasStartDate = !!c.startDate;

    const computedLifecycle = classifyAxisCareClientLifecycle({
      status: { active: !!c.status?.active, label: c.status?.label ?? "" },
      classes: (c.classes ?? []).map((cl) => ({ code: cl.code, label: cl.label ?? "" })),
      hasContactInfo,
      hasStartDate,
    });

    // Identity matching — unchanged logic, run once here instead of on
    // every page render. A name-denylisted or placeholder record is
    // never matched against real residents. isNameDenylisted is kept pure
    // (matches the live axiscareClientOperationalSummary.ts path exactly)
    // and persisted independently of is_placeholder_record — both are
    // real, distinct exclusion mechanisms (a related contact person
    // mistakenly entered as a client vs. a structural "Community" row),
    // needed separately by /clients' migration to stored state and by
    // community Needs Review composition (see needsReviewEligibility.ts).
    const normalizedName = normalizeName(c.firstName ?? "", c.lastName ?? "");
    const isNameDenylisted = isKnownNonResidentAxisCareClient(normalizedName);
    const skipIdentityMatching = isPlaceholder || isNameDenylisted;
    let matchedResidentId: string | null = null;
    let identityStatus: "confirmed" | "candidate" | "needs_identity_review" | "unmatched" = "unmatched";
    let matchBasis: ClientMatchBasis = "none";

    if (!skipIdentityMatching) {
      const match = matchAxisCareClientToResident(
        {
          normalizedEmail: email,
          normalizedPhones: phones,
          normalizedName,
          normalizedLastName: c.lastName ? normalizeLastName(c.lastName) : null,
          unitNumber: null,
          communityName: c.community?.name ?? null,
        },
        residentCandidates
      );
      const existingLink = existingLinks.get(axiscareId) ?? null;
      const resolved = resolveAxisCareResidentMatch(match, existingLink);
      matchedResidentId = resolved.residentId;
      matchBasis = resolved.basis;
      if (existingLink?.status === "confirmed") identityStatus = "confirmed";
      else if (resolved.residentId === null) identityStatus = "unmatched";
      else if (resolved.requiresReview) identityStatus = "needs_identity_review";
      else identityStatus = "candidate";
      if (matchedResidentId) matchedResidentCount++;
    }

    const result = await upsertAxisCareOperationalState({
      axiscareClientId: axiscareId,
      vendorDisplayName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null,
      statusActive: !!c.status?.active,
      statusLabel: c.status?.label ?? null,
      classCodes,
      axiscareCommunityId: c.community?.id ?? null,
      axiscareCommunityName: c.community?.name ?? null,
      startDate: c.startDate ?? null,
      conversionDate: c.conversionDate ?? null,
      effectiveEndDate: c.effectiveEndDate ?? null,
      hasContactInfo,
      resolvedCommunityId,
      communityResolutionSource: communityResolution.source,
      computedLifecycle,
      isPlaceholderRecord: isPlaceholder,
      isNameDenylisted,
      matchedResidentId,
      identityStatus,
      matchBasis,
    });

    if (result.error) failed++;
    else persisted++;
  }

  return {
    totalRosterRecords: (clientsResult.records as RawAxisCareClient[]).length,
    persisted,
    failed,
    communityResolved,
    communityUnresolved,
    placeholdersExcluded,
    matchedResidentCount,
  };
}
