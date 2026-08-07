// Read-only AxisCare Lead evidence for the Prospect/Reconciliation
// layer. A Lead is never a separate Serve identity or lifecycle state
// (see docs on "AxisCare Lead = Serve Prospect") — this module surfaces
// each Lead as EVIDENCE about a possible existing canonical person,
// using the exact same deterministic matcher already used for AxisCare
// Clients (lib/integrations/axiscare/clientIdentityMatching.ts) — no
// second identity-matching system. Nothing here writes to the
// database, creates a person_vendor_identity_links row, or creates a
// resident/relationship. A confirmed identity decision for a Lead goes
// through the same Reconciliation workflow as a Client match, once a
// human reviews it — not built automatically here.
import "server-only";
import { createServerClient } from "../supabase/server.ts";
import { getAllLeads } from "../integrations/axiscare/leads.ts";
import {
  matchAxisCareClientToResident,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeLastName,
  type NormalizedResidentCandidate,
  type ClientMatchBasis,
} from "../integrations/axiscare/clientIdentityMatching.ts";
import { getAxisCareClientOperationalSummary } from "./axiscareClientOperationalSummary.ts";

interface RawAxisCareLead {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  personalEmail?: string | null;
  homePhone?: string | null;
  mobilePhone?: string | null;
  status?: { active?: boolean; label?: string } | null;
}

export interface AxisCareLeadEvidenceRow {
  readonly leadId: string;
  readonly name: string;
  readonly statusLabel: string | null;
  readonly residentMatch: {
    readonly residentId: string | null;
    readonly residentName: string | null;
    readonly basis: ClientMatchBasis;
    readonly requiresReview: boolean;
  };
  // Same matched resident also has an existing AxisCare Client match —
  // the Bob Hatch (Lead #30 / Client #23) / Pam Hatch (Lead #31 /
  // Client #22) pattern. Evidence only — never auto-merged, never used
  // to alter either record.
  readonly alsoHasAxisCareClientMatch: { readonly axiscareClientId: string; readonly identityStatus: string } | null;
}

export async function getAxisCareLeadEvidence(): Promise<{ readonly rows: readonly AxisCareLeadEvidenceRow[] }> {
  const supabase = createServerClient();

  const [{ data: residentsRaw }, leadsResult, clientSummary] = await Promise.all([
    supabase
      .from("residents")
      .select("id, first_name, last_name, display_name, full_name, email, phone, phone_raw, unit_number, community_name"),
    getAllLeads(),
    getAxisCareClientOperationalSummary(),
  ]);

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
  const residentNamesById = new Map(residents.map((r) => [r.id, r.displayName]));

  const clientMatchByResident = new Map(
    clientSummary.rows
      .filter((row) => row.operationalBucket !== "excluded" && row.residentMatch.residentId)
      .map((row) => [row.residentMatch.residentId as string, { axiscareClientId: row.axiscareId, identityStatus: row.identityStatus }])
  );

  const rows: AxisCareLeadEvidenceRow[] = (leadsResult.records as RawAxisCareLead[]).map((lead) => {
    const leadId = String(lead.id);
    const normalizedName = normalizeName(lead.firstName ?? "", lead.lastName ?? "");
    const email = normalizeEmail(lead.personalEmail);
    const phones = [lead.homePhone, lead.mobilePhone].map(normalizePhone).filter((p): p is string => p !== null);

    const match = matchAxisCareClientToResident(
      {
        normalizedEmail: email,
        normalizedPhones: phones,
        normalizedName,
        normalizedLastName: lead.lastName ? normalizeLastName(lead.lastName) : null,
        unitNumber: null,
        // Leads are pre-service — no community assignment yet, so the
        // community-based matching tiers never fire for them. Only
        // email/phone/last-name evidence applies.
        communityName: null,
      },
      residents
    );

    return {
      leadId,
      name: `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim(),
      statusLabel: lead.status?.label ?? null,
      residentMatch: {
        residentId: match.residentId,
        residentName: match.residentId ? (residentNamesById.get(match.residentId) ?? null) : null,
        basis: match.basis,
        requiresReview: match.requiresReview,
      },
      alsoHasAxisCareClientMatch: match.residentId ? (clientMatchByResident.get(match.residentId) ?? null) : null,
    };
  });

  return { rows };
}
