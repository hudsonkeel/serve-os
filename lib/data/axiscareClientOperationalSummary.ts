// Assembles the real, live operational picture of the AxisCare client
// roster: lifecycle (clientLifecycle.ts), disposition
// (clientDisposition.ts), and Serve identity resolution
// (clientIdentityMatching.ts + person_vendor_identity_links), combined
// via clientOperationalStatus.ts. This is the one place a future
// People We Serve UI (or any other consumer) should read from — no
// page currently calls this; it exists so the disposition model is a
// real, reusable part of the computation pipeline rather than logic
// re-derived ad hoc on every reconciliation pass.
import "server-only";
import { createServerClient } from "../supabase/server.ts";
import { getAllClients } from "../integrations/axiscare/clients.ts";
import {
  matchAxisCareClientToResident,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeLastName,
  isKnownNonResidentAxisCareClient,
  type NormalizedResidentCandidate,
  type ClientMatchBasis,
} from "../integrations/axiscare/clientIdentityMatching.ts";
import { classifyAxisCareClientLifecycle, hasServiceStarted, type ServeClientLifecycle } from "../integrations/axiscare/clientLifecycle.ts";
import {
  resolveAxisCareClientOperationalBucket,
  resolveAxisCareIdentityStatus,
  resolveAxisCareResidentMatch,
  type AxisCareClientOperationalBucket,
  type AxisCareIdentityStatus,
} from "../integrations/axiscare/clientOperationalStatus.ts";
import type { AxisCareClientDisposition } from "../integrations/axiscare/clientDisposition.ts";
import { getAxisCareClientDispositions } from "./axiscareClientDispositions.ts";
import { suggestResidentMatchesForAxisCareClient, type SuggestedResidentMatch } from "../integrations/axiscare/unmatchedClientCandidates.ts";
import { resolveAxisCareCommunityCode } from "../integrations/axiscare/communityMapping.ts";
import { listCommunities } from "./communities.ts";
import { getAllAxisCareOperationalState } from "./axiscareOperationalState.ts";

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
  effectiveEndDate?: string | null;
}

export interface AxisCareClientOperationalRow {
  readonly axiscareId: string;
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly statusActive: boolean;
  readonly statusLabel: string | null;
  readonly classes: readonly string[];
  // Community affiliation — an independent dimension from lifecycle,
  // identity, and disposition (see docs on the People We Serve
  // community-context foundation). Never hardcoded; read directly from
  // AxisCare's own community field for this record, whatever community
  // that happens to be.
  readonly communityName: string | null;
  // The DETERMINISTIC resolved community (community.id -> community.name
  // -> exact class code -> unresolved; see communityMapping.ts), display-
  // only here — never used to change matching/identity logic, only to
  // default the "Create New Resident" form's community and to show a
  // community even for the class-code-fallback case where communityName
  // above is null (e.g. Linda Kaplan). Null when genuinely unresolved.
  readonly resolvedCommunityId: string | null;
  readonly resolvedCommunityName: string | null;
  readonly computedLifecycle: ServeClientLifecycle;
  readonly disposition: AxisCareClientDisposition | null;
  readonly dispositionRationale: string | null;
  readonly dispositionSetBy: string | null;
  readonly dispositionSetAt: string | null;
  readonly operationalBucket: AxisCareClientOperationalBucket;
  // "name_denylist" (lib/integrations/axiscare/clientIdentityMatching.ts's
  // KNOWN_NON_RESIDENT_NAMES) or "disposition:<value>" — both are
  // independent exclusion mechanisms that combine, never overriding
  // each other.
  readonly exclusionReason: string | null;
  readonly identityStatus: AxisCareIdentityStatus;
  readonly residentMatch: {
    readonly residentId: string | null;
    readonly residentName: string | null;
    readonly basis: ClientMatchBasis;
    readonly requiresReview: boolean;
    readonly confirmedLinkStatus: string | null;
  };
  // Only ever populated for identityStatus === "unmatched" — human-review
  // suggestions for the Reconciliation "Match to Existing Person"
  // workflow (lib/integrations/axiscare/unmatchedClientCandidates.ts).
  // Never influences identityStatus/residentMatch above; the deterministic
  // auto-matcher is completely untouched by this.
  readonly suggestedMatches: readonly SuggestedResidentMatch[];
}

export interface AxisCareClientOperationalSummary {
  readonly fetchedAt: string;
  readonly rows: readonly AxisCareClientOperationalRow[];
  readonly counts: Record<AxisCareClientOperationalBucket, number>;
}

interface RawResidentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_raw: string | null;
  unit_number: string | null;
  community_name: string | null;
}

// Canonicalizes the AxisCare match-candidate pool against Resident
// Identity Resolution (supabase/migrations/20260805000000_create_resident_identity_resolution.sql):
// a resident that has been retired/redirected through that system (e.g.
// "Elliott Goldberg" redirected to canonical "Elliot Goldberg") must never
// win an AxisCare identity match under its own, now-retired identity —
// source candidate -> redirect/alias -> canonical resident, never source
// candidate -> dead resident. Implemented as an additive candidate-list
// transform only: matchAxisCareClientToResident() itself is untouched, so
// every existing match tier (email, phone, apartment, community) keeps its
// exact precedence and semantics — a redirected duplicate's own name (and
// any resident_identity_aliases spelling variant) simply becomes an
// alternate name-only candidate ROW that resolves to the CANONICAL
// resident's id, alongside the canonical's own real candidate row. Alias/
// redirect-derived rows never carry email or phone (never let a stale
// duplicate's contact fields independently win an email/phone-tier match
// on the canonical's behalf — only the canonical's own real contact data
// does that) but do carry the canonical's own real community/apartment, so
// the name_and_community / name_and_apartment tiers can still fire.
export function buildAxisCareMatchCandidates(
  residentsRaw: readonly RawResidentRow[],
  redirects: readonly { duplicate_resident_id: string; canonical_resident_id: string }[],
  aliases: readonly { canonical_resident_id: string; normalized_value: string }[]
): NormalizedResidentCandidate[] {
  const residentById = new Map(residentsRaw.map((r) => [r.id, r]));
  const canonicalIdByDuplicateId = new Map(redirects.map((r) => [r.duplicate_resident_id, r.canonical_resident_id]));

  function candidateFor(canonicalId: string, normalizedName: string): NormalizedResidentCandidate | null {
    const canonical = residentById.get(canonicalId);
    if (!canonical) return null; // defensive: a redirect/alias pointing at a resident row that no longer exists
    return {
      id: canonicalId,
      displayName: canonical.display_name || canonical.full_name || `${canonical.first_name ?? ""} ${canonical.last_name ?? ""}`.trim(),
      normalizedEmail: null,
      normalizedPhones: [],
      normalizedName,
      normalizedLastName: null,
      unitNumber: canonical.unit_number,
      communityName: canonical.community_name,
    };
  }

  const candidates: NormalizedResidentCandidate[] = [];

  for (const r of residentsRaw) {
    // A retired/redirected duplicate is never an independent match
    // candidate under its own identity — its name still matters (below,
    // via the alias it always gets on merge), just no longer as "this
    // resident."
    if (canonicalIdByDuplicateId.has(r.id)) continue;
    candidates.push({
      id: r.id,
      displayName: r.display_name || r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      normalizedEmail: normalizeEmail(r.email),
      normalizedPhones: [r.phone, r.phone_raw].map(normalizePhone).filter((p): p is string => p !== null),
      normalizedName: normalizeName(r.first_name ?? "", r.last_name ?? ""),
      normalizedLastName: r.last_name ? normalizeLastName(r.last_name) : null,
      unitNumber: r.unit_number,
      communityName: r.community_name,
    });
  }

  // A redirected duplicate's own (pre-merge) name resolves straight to its
  // canonical resident — this is exactly what merge_residents() already
  // recorded as a resident_identity_aliases row when the names differed,
  // so in practice this loop and the alias loop below cover the same
  // ground for a completed merge; kept as its own explicit case so a
  // redirect is honored even in the (currently impossible, but not
  // contractually guaranteed) case its alias row is missing.
  for (const [duplicateId, canonicalId] of canonicalIdByDuplicateId) {
    const duplicate = residentById.get(duplicateId);
    if (!duplicate) continue;
    const normalizedName = normalizeName(duplicate.first_name ?? "", duplicate.last_name ?? "");
    const candidate = candidateFor(canonicalId, normalizedName);
    if (candidate) candidates.push(candidate);
  }

  // Every confirmed alias (resident_identity_aliases — spelling variants,
  // historical spellings, source-specific spellings, etc.) is real,
  // governed identity evidence for its canonical resident, usable here the
  // same way the resident's own primary name is.
  for (const alias of aliases) {
    const candidate = candidateFor(alias.canonical_resident_id, alias.normalized_value);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

// AxisCare Reconciliation + Multi-Source Identity Ingestion phase, section
// 12/43: "Create New Resident" must never bypass identity matching, and
// must never trust a client-submitted "no match" state — a second
// operator, or new data, could have appeared since the page loaded. This
// re-fetches residents fresh and re-runs the exact same deterministic
// matcher the live summary/sync paths use, immediately before a create
// action is allowed to proceed. Returns null only when the fresh
// computation genuinely finds nothing credible.
export async function findFreshCredibleResidentMatch(input: {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly personalEmail?: string | null;
  readonly billingEmail?: string | null;
  readonly homePhone?: string | null;
  readonly mobilePhone?: string | null;
  readonly otherPhone?: string | null;
  readonly communityName: string | null;
}): Promise<{ residentId: string; residentName: string | null; basis: ClientMatchBasis } | null> {
  const supabase = createServerClient();
  const [{ data: residentsRaw }, { data: redirectsRaw }, { data: aliasesRaw }] = await Promise.all([
    supabase
      .from("residents")
      .select("id, first_name, last_name, display_name, full_name, email, phone, phone_raw, unit_number, community_name"),
    supabase.from("resident_identity_redirects").select("duplicate_resident_id, canonical_resident_id"),
    supabase.from("resident_identity_aliases").select("canonical_resident_id, normalized_value"),
  ]);

  const candidates = buildAxisCareMatchCandidates(residentsRaw ?? [], redirectsRaw ?? [], aliasesRaw ?? []);
  const email = normalizeEmail(input.personalEmail ?? input.billingEmail ?? null);
  const phones = [input.homePhone, input.mobilePhone, input.otherPhone].map(normalizePhone).filter((p): p is string => p !== null);

  const match = matchAxisCareClientToResident(
    {
      normalizedEmail: email,
      normalizedPhones: phones,
      normalizedName: normalizeName(input.firstName ?? "", input.lastName ?? ""),
      normalizedLastName: input.lastName ? normalizeLastName(input.lastName) : null,
      unitNumber: null,
      communityName: input.communityName,
    },
    candidates
  );

  if (match.residentId === null) return null;
  const residentNamesById = new Map(candidates.map((c) => [c.id, c.displayName]));
  return { residentId: match.residentId, residentName: residentNamesById.get(match.residentId) ?? null, basis: match.basis };
}

// KNOWN, DELIBERATE GAP (Phase E/F, section 18) — investigated, not
// overlooked. This still makes a live AxisCare getAllClients() call on
// every /residents and /residents/[id] render (previously flagged in the
// performance baseline). A clean removal was attempted this phase: the
// only existing stored/synced AxisCare table, axiscare_client_canonical_snapshot,
// was checked directly against the live schema and holds only demographic
// gap-fill fields (date_of_birth, address, triage level, responsible
// party) — never status/active, classes, community, or lifecycle, which
// this function's identityStatus/operationalBucket/axiscareMatch
// computation genuinely needs, and which serveRelationshipProjection.ts
// feeds directly into every resident's Active Client/Prospect/etc. status.
// Swapping to that table would silently degrade relationship-status
// correctness for every resident, not just remove a live call — worse than
// the performance cost it would fix. Not attempted. What IS confirmed:
// this phase's community scoping does not multiply this call — it is
// still exactly one getAllClients() call regardless of how many
// communities exist or which one is selected, since AxisCare tenancy
// (one tenant vs. per-community credentials) remains the unresolved
// question from Phase D.5, deferred to a dedicated AxisCare integration
// phase alongside a real stored-operational-status table.
export async function getAxisCareClientOperationalSummary(): Promise<AxisCareClientOperationalSummary> {
  const supabase = createServerClient();

  const [{ data: residentsRaw }, { data: existingLinksRaw }, { data: redirectsRaw }, { data: aliasesRaw }, dispositions, clientsResult, communities] =
    await Promise.all([
      supabase
        .from("residents")
        .select("id, first_name, last_name, display_name, full_name, email, phone, phone_raw, unit_number, community_name"),
      supabase.from("person_vendor_identity_links").select("*").eq("subject_type", "resident").eq("source_system", "axiscare"),
      supabase.from("resident_identity_redirects").select("duplicate_resident_id, canonical_resident_id"),
      supabase.from("resident_identity_aliases").select("canonical_resident_id, normalized_value"),
      getAxisCareClientDispositions(),
      getAllClients(),
      listCommunities(),
    ]);

  const residents = buildAxisCareMatchCandidates(residentsRaw ?? [], redirectsRaw ?? [], aliasesRaw ?? []);
  const communityIdByCode = new Map(communities.map((c) => [c.code, c.id]));
  const communityNameById = new Map(communities.map((c) => [c.id, c.name]));

  const existingLinks = new Map(
    (existingLinksRaw ?? []).map((l) => [String(l.vendor_record_id), l as { subject_id: string | null; status: string }])
  );
  const residentNamesById = new Map(residents.map((r) => [r.id, r.displayName]));

  const counts: Record<AxisCareClientOperationalBucket, number> = {
    active_client: 0,
    inactive_client: 0,
    prospect: 0,
    needs_review: 0,
    excluded: 0,
  };

  const rows: AxisCareClientOperationalRow[] = (clientsResult.records as RawAxisCareClient[]).map((c) => {
    const axiscareId = String(c.id);
    const normalizedName = normalizeName(c.firstName ?? "", c.lastName ?? "");
    const email = normalizeEmail(c.personalEmail ?? c.billingEmail);
    const phones = [c.homePhone, c.mobilePhone, c.otherPhone].map(normalizePhone).filter((p): p is string => p !== null);
    const hasContactInfo = !!(email || phones.length);

    const computedLifecycle = classifyAxisCareClientLifecycle({
      status: { active: !!c.status?.active, label: c.status?.label ?? "" },
      classes: (c.classes ?? []).map((cl) => ({ code: cl.code, label: cl.label ?? "" })),
      hasContactInfo,
      hasStartDate: hasServiceStarted(c.startDate),
    });

    const dispositionRow = dispositions.get(axiscareId) ?? null;
    const isNameDenylisted = isKnownNonResidentAxisCareClient(normalizedName);

    let operationalBucket: AxisCareClientOperationalBucket;
    let exclusionReason: string | null;
    if (isNameDenylisted) {
      operationalBucket = "excluded";
      exclusionReason = "name_denylist";
    } else {
      operationalBucket = resolveAxisCareClientOperationalBucket(computedLifecycle, dispositionRow?.disposition ?? null);
      exclusionReason = operationalBucket === "excluded" ? `disposition:${dispositionRow?.disposition}` : null;
    }

    counts[operationalBucket] += 1;

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
    const existingLink = existingLinks.get(axiscareId) ?? null;
    const resolved = resolveAxisCareResidentMatch(match, existingLink);

    const residentMatch = {
      residentId: resolved.residentId,
      residentName: resolved.residentId ? (residentNamesById.get(resolved.residentId) ?? null) : null,
      basis: resolved.basis,
      requiresReview: resolved.requiresReview,
      confirmedLinkStatus: existingLink?.status ?? null,
    };

    const clientClasses = (c.classes ?? []).map((cl) => cl.code);

    // Display-only deterministic community resolution (communityMapping.ts)
    // — never used above for matching/identity/lifecycle, only to default
    // the "Create New Resident" form's community and to show a real
    // community even where the raw communityName field (below) is null
    // (the class-code-fallback case).
    const communityResolution = resolveAxisCareCommunityCode({
      communityId: c.community?.id ?? null,
      communityName: c.community?.name ?? null,
      classCodes: clientClasses,
    });
    const resolvedCommunityId = communityResolution.communityCode
      ? (communityIdByCode.get(communityResolution.communityCode) ?? null)
      : null;

    const suggestedMatches =
      resolved.residentId === null
        ? suggestResidentMatchesForAxisCareClient(
            {
              normalizedName,
              normalizedLastName: c.lastName ? normalizeLastName(c.lastName) : null,
              normalizedEmail: email,
              normalizedPhones: phones,
              communityName: c.community?.name ?? null,
              classes: clientClasses,
            },
            residents
          )
        : [];

    return {
      axiscareId,
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? "",
      statusActive: !!c.status?.active,
      statusLabel: c.status?.label ?? null,
      classes: clientClasses,
      communityName: c.community?.name ?? null,
      resolvedCommunityId,
      resolvedCommunityName: resolvedCommunityId ? (communityNameById.get(resolvedCommunityId) ?? null) : null,
      computedLifecycle,
      disposition: dispositionRow?.disposition ?? null,
      dispositionRationale: dispositionRow?.rationale ?? null,
      dispositionSetBy: dispositionRow?.setBy ?? null,
      dispositionSetAt: dispositionRow?.setAt ?? null,
      operationalBucket,
      exclusionReason,
      identityStatus: resolveAxisCareIdentityStatus(residentMatch),
      residentMatch,
      suggestedMatches,
    };
  });

  return { fetchedAt: new Date().toISOString(), rows, counts };
}

// ─── Stored-state summary — /clients' ordinary render path ────────────────
//
// AxisCare Reconciliation + Multi-Source Identity Ingestion phase, section
// 30/52. Same AxisCareClientOperationalSummary shape as the live function
// above, built entirely from axiscare_client_operational_state (refreshed
// daily/on manual sync) plus a live, fast, internal disposition lookup — no
// getAllClients() call. This is now sufficient because the prior gap (the
// live path's name-denylist exclusion was never persisted) is closed by
// is_name_denylisted (see 20260902240000). suggestedMatches is always []
// here — only Reconciliation's unmatched-record UI needs fresh candidate
// suggestions; /clients never rendered them. Reconciliation itself
// deliberately keeps calling the LIVE function above — discovering
// brand-new, not-yet-synced roster records is its whole purpose.
export async function getStoredAxisCareClientOperationalSummary(): Promise<AxisCareClientOperationalSummary> {
  const supabase = createServerClient();

  const [storedRows, dispositions, communities] = await Promise.all([
    getAllAxisCareOperationalState(),
    getAxisCareClientDispositions(),
    listCommunities(),
  ]);
  const communityNameById = new Map(communities.map((c) => [c.id, c.name]));

  const matchedResidentIds = [...new Set(storedRows.map((r) => r.matchedResidentId).filter((id): id is string => id !== null))];
  const { data: residentsRaw } =
    matchedResidentIds.length > 0
      ? await supabase.from("residents").select("id, display_name, full_name, first_name, last_name").in("id", matchedResidentIds)
      : { data: [] as { id: string; display_name: string | null; full_name: string | null; first_name: string | null; last_name: string | null }[] };
  const residentNamesById = new Map(
    (residentsRaw ?? []).map((r) => [r.id, r.display_name || r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()])
  );

  const counts: Record<AxisCareClientOperationalBucket, number> = {
    active_client: 0,
    inactive_client: 0,
    prospect: 0,
    needs_review: 0,
    excluded: 0,
  };

  const rows: AxisCareClientOperationalRow[] = storedRows.map((row) => {
    const dispositionRow = dispositions.get(row.axiscareClientId) ?? null;

    let operationalBucket: AxisCareClientOperationalBucket;
    let exclusionReason: string | null;
    if (row.isNameDenylisted) {
      operationalBucket = "excluded";
      exclusionReason = "name_denylist";
    } else {
      operationalBucket = resolveAxisCareClientOperationalBucket(row.computedLifecycle, dispositionRow?.disposition ?? null);
      exclusionReason = operationalBucket === "excluded" ? `disposition:${dispositionRow?.disposition}` : null;
    }
    counts[operationalBucket] += 1;

    const [firstName, ...lastParts] = (row.vendorDisplayName ?? "").split(" ");

    return {
      axiscareId: row.axiscareClientId,
      name: row.vendorDisplayName ?? `AxisCare #${row.axiscareClientId}`,
      firstName: firstName ?? "",
      lastName: lastParts.join(" "),
      statusActive: row.statusActive,
      statusLabel: row.statusLabel,
      classes: row.classCodes,
      communityName: row.axiscareCommunityName,
      resolvedCommunityId: row.resolvedCommunityId,
      resolvedCommunityName: row.resolvedCommunityId ? (communityNameById.get(row.resolvedCommunityId) ?? null) : null,
      computedLifecycle: row.computedLifecycle,
      disposition: dispositionRow?.disposition ?? null,
      dispositionRationale: dispositionRow?.rationale ?? null,
      dispositionSetBy: dispositionRow?.setBy ?? null,
      dispositionSetAt: dispositionRow?.setAt ?? null,
      operationalBucket,
      exclusionReason,
      identityStatus: row.identityStatus,
      residentMatch: {
        residentId: row.matchedResidentId,
        residentName: row.matchedResidentId ? (residentNamesById.get(row.matchedResidentId) ?? null) : null,
        basis: row.matchBasis ?? "none",
        requiresReview: row.identityStatus === "needs_identity_review",
        confirmedLinkStatus: row.identityStatus === "confirmed" ? "confirmed" : null,
      },
      suggestedMatches: [],
    };
  });

  return { fetchedAt: new Date().toISOString(), rows, counts };
}
