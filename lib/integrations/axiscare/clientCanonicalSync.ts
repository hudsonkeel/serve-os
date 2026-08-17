// AxisCare -> Serve canonical bootstrap: the FETCH/SNAPSHOT half only.
// Reads AxisCare (read-only, via the existing axisCareGet()), writes
// ONLY to axiscare_client_canonical_snapshot — never to residents. The
// separate apply step (clientCanonicalApply.ts) is the only code in this
// bootstrap allowed to touch residents, and only for the fields this
// module actually extracts below.
//
// Fields extracted are exactly the ones the 2026-08-17 live discovery
// pass confirmed are (a) real named fields on AxisCare's Client resource
// and (b) actually populated for real Serve clients: dateOfBirth,
// gender, startDate, residentialAddress.*, triageLevel. Responsible
// party fields are also captured — for family_contact_* bootstrap AND
// for provenance/human review on the guardian question (see the
// migration's own header comment on why guardian is never auto-applied).
// Physician contact and ADL data are deliberately NOT fetched here: the
// re-investigated discovery pass confirmed AxisCare's Contact.clients[]
// linkage mechanism is real and API-accessible, but zero of the 19
// "Physician" contacts in this account are linked to any client, and
// zero ADL records exist for any of the 4 sampled clients — there is
// nothing real to snapshot for either today, a data gap not a capability
// gap. Revisit only after a fresh discovery pass confirms real linkage/
// ADL data exists.
import "server-only";
import crypto from "node:crypto";
import { axisCareGet } from "./client.ts";
import { getConfirmedResidentAxisCareLinks } from "../../data/residentAxisCareLinks.ts";
import {
  upsertAxisCareClientCanonicalSnapshot,
  type AxisCareClientCanonicalSnapshotFields,
} from "../../data/axiscareClientCanonicalSnapshot.ts";

interface RawAxisCareClientAddress {
  streetAddress1?: string | null;
  streetAddress2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

interface RawAxisCareTriageLevel {
  id?: string | number | null;
  description?: string | null;
}

interface RawAxisCareClientDetail {
  dateOfBirth?: string | null;
  gender?: string | null;
  startDate?: string | null;
  residentialAddress?: RawAxisCareClientAddress | null;
  triageLevel?: RawAxisCareTriageLevel | null;
}

interface RawAxisCareResponsibleParty {
  name?: string | null;
  relationship?: string | null;
  email?: string | null;
  phones?: { number?: string | null }[] | null;
  canMakeMedicalDecisions?: string | null;
}

function blankToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function firstPhone(party: RawAxisCareResponsibleParty | undefined): string | null {
  const phone = party?.phones?.find((p) => blankToNull(p.number ?? null) !== null);
  return blankToNull(phone?.number ?? null);
}

function hashFields(fields: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export interface SyncOneResult {
  axiscareClientId: string;
  residentId: string | null;
  ok: boolean;
  error?: string;
}

// Fetches and snapshots exactly one confirmed-identity resident's
// AxisCare client record. Never called for a candidate/needs-review
// match — the caller (syncAllConfirmedResidents) enforces that by only
// ever iterating getConfirmedResidentAxisCareLinks()'s own result.
export async function syncOneAxisCareClientCanonicalSnapshot(
  axiscareClientId: string,
  residentId: string | null
): Promise<SyncOneResult> {
  try {
    const clientResult = await axisCareGet<{ results: RawAxisCareClientDetail }>(`/api/clients/${axiscareClientId}`);
    const client = clientResult.body.results;

    let responsibleParty: RawAxisCareResponsibleParty | undefined;
    try {
      const rpResult = await axisCareGet<{ results: RawAxisCareResponsibleParty[] }>(
        `/api/clients/${axiscareClientId}/responsibleParties`
      );
      // Position 1 only — AxisCare always returns 3 slots; in every
      // sampled real record, only the first (if any) was ever populated.
      responsibleParty = rpResult.body.results.find((p) => blankToNull(p.name ?? null) !== null);
    } catch {
      // Responsible parties are a supplementary, provenance-only capture
      // — a failure here should not block the core profile fields below.
      responsibleParty = undefined;
    }

    const fields: AxisCareClientCanonicalSnapshotFields = {
      dateOfBirth: blankToNull(client.dateOfBirth ?? null),
      gender: blankToNull(client.gender ?? null),
      admissionDate: blankToNull(client.startDate ?? null),
      streetAddress1: blankToNull(client.residentialAddress?.streetAddress1 ?? null),
      streetAddress2: blankToNull(client.residentialAddress?.streetAddress2 ?? null),
      city: blankToNull(client.residentialAddress?.city ?? null),
      state: blankToNull(client.residentialAddress?.state ?? null),
      postalCode: blankToNull(client.residentialAddress?.postalCode ?? null),
      triageLevelId: client.triageLevel?.id !== null && client.triageLevel?.id !== undefined ? String(client.triageLevel.id) : null,
      triageLevelDescription: blankToNull(client.triageLevel?.description ?? null),
      responsiblePartyName: blankToNull(responsibleParty?.name ?? null),
      responsiblePartyRelationship: blankToNull(responsibleParty?.relationship ?? null),
      responsiblePartyPhone: firstPhone(responsibleParty),
      responsiblePartyEmail: blankToNull(responsibleParty?.email ?? null),
      responsiblePartyCanMakeMedicalDecisions: blankToNull(responsibleParty?.canMakeMedicalDecisions ?? null),
      sourceResponseHash: null,
    };
    fields.sourceResponseHash = hashFields(fields as unknown as Record<string, unknown>);

    const result = await upsertAxisCareClientCanonicalSnapshot(axiscareClientId, fields);
    if (result.error) return { axiscareClientId, residentId, ok: false, error: result.error };

    return { axiscareClientId, residentId, ok: true };
  } catch (err) {
    return {
      axiscareClientId,
      residentId,
      ok: false,
      error: err instanceof Error ? err.message : "Unknown AxisCare fetch error",
    };
  }
}

// Syncs every identity-CONFIRMED resident (never candidate/needs-review
// — see getConfirmedResidentAxisCareLinks()'s own comment). One
// sequential pass, not parallelized — this integration has no documented
// rate limit and sequential calls are the safer default for an
// unfamiliar vendor API under an authorized-but-still-bootstrap-phase
// credential.
export async function syncAllConfirmedResidentsAxisCareCanonicalSnapshot(): Promise<SyncOneResult[]> {
  const links = await getConfirmedResidentAxisCareLinks();
  const results: SyncOneResult[] = [];
  for (const link of links) {
    results.push(await syncOneAxisCareClientCanonicalSnapshot(link.vendor_record_id, link.subject_id));
  }
  return results;
}
