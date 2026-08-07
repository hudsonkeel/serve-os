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
  isKnownNonResidentAxisCareClient,
  type NormalizedResidentCandidate,
  type ClientMatchBasis,
} from "../integrations/axiscare/clientIdentityMatching.ts";
import { classifyAxisCareClientLifecycle, type ServeClientLifecycle } from "../integrations/axiscare/clientLifecycle.ts";
import {
  resolveAxisCareClientOperationalBucket,
  type AxisCareClientOperationalBucket,
} from "../integrations/axiscare/clientOperationalStatus.ts";
import type { AxisCareClientDisposition } from "../integrations/axiscare/clientDisposition.ts";
import { getAxisCareClientDispositions } from "./axiscareClientDispositions.ts";

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

export interface AxisCareClientOperationalRow {
  readonly axiscareId: string;
  readonly name: string;
  readonly statusActive: boolean;
  readonly statusLabel: string | null;
  readonly classes: readonly string[];
  readonly computedLifecycle: ServeClientLifecycle;
  readonly disposition: AxisCareClientDisposition | null;
  readonly dispositionRationale: string | null;
  readonly operationalBucket: AxisCareClientOperationalBucket;
  // "name_denylist" (lib/integrations/axiscare/clientIdentityMatching.ts's
  // KNOWN_NON_RESIDENT_NAMES) or "disposition:<value>" — both are
  // independent exclusion mechanisms that combine, never overriding
  // each other.
  readonly exclusionReason: string | null;
  readonly residentMatch: {
    readonly residentId: string | null;
    readonly basis: ClientMatchBasis;
    readonly requiresReview: boolean;
    readonly confirmedLinkStatus: string | null;
  };
}

export interface AxisCareClientOperationalSummary {
  readonly fetchedAt: string;
  readonly rows: readonly AxisCareClientOperationalRow[];
  readonly counts: Record<AxisCareClientOperationalBucket, number>;
}

export async function getAxisCareClientOperationalSummary(): Promise<AxisCareClientOperationalSummary> {
  const supabase = createServerClient();

  const [{ data: residentsRaw }, { data: existingLinksRaw }, dispositions, clientsResult] = await Promise.all([
    supabase
      .from("residents")
      .select("id, first_name, last_name, display_name, full_name, email, phone, phone_raw, unit_number, community_name"),
    supabase.from("person_vendor_identity_links").select("*").eq("subject_type", "resident").eq("source_system", "axiscare"),
    getAxisCareClientDispositions(),
    getAllClients(),
  ]);

  const residents: NormalizedResidentCandidate[] = (residentsRaw ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name || r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    normalizedEmail: normalizeEmail(r.email),
    normalizedPhones: [r.phone, r.phone_raw].map(normalizePhone).filter((p): p is string => p !== null),
    normalizedName: normalizeName(r.first_name ?? "", r.last_name ?? ""),
    unitNumber: r.unit_number,
    communityName: r.community_name,
  }));

  const existingLinks = new Map(
    (existingLinksRaw ?? []).map((l) => [String(l.vendor_record_id), l as { subject_id: string | null; status: string }])
  );

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
      hasStartDate: !!c.startDate,
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
      { normalizedEmail: email, normalizedPhones: phones, normalizedName, unitNumber: null, communityName: c.community?.name ?? null },
      residents
    );
    const existingLink = existingLinks.get(axiscareId) ?? null;

    return {
      axiscareId,
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      statusActive: !!c.status?.active,
      statusLabel: c.status?.label ?? null,
      classes: (c.classes ?? []).map((cl) => cl.code),
      computedLifecycle,
      disposition: dispositionRow?.disposition ?? null,
      dispositionRationale: dispositionRow?.rationale ?? null,
      operationalBucket,
      exclusionReason,
      residentMatch: {
        residentId: existingLink?.subject_id ?? match.residentId,
        basis: match.basis,
        requiresReview: match.requiresReview,
        confirmedLinkStatus: existingLink?.status ?? null,
      },
    };
  });

  return { fetchedAt: new Date().toISOString(), rows, counts };
}
