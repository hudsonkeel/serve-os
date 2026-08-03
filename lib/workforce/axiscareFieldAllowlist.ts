// Explicit field allowlist for AxisCare caregiver records — see
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md and the mission's own
// "Never persist the raw AxisCare response unless fields have been
// reviewed" requirement. Pure, no I/O — takes an already-fetched raw
// caregiver record (from lib/integrations/axiscare/caregivers.ts) and
// returns only the reviewed subset, safe to store in
// person_vendor_identity_links.approved_source_data.
//
// Live-confirmed caregiver fields NOT in this allowlist, and why:
//   ssn, driverLicenseNumber/Expiration/Issued/State — never requested
//     (requestedSensitiveFields is never sent), gated behind that param
//     even when present in the schema. Kept out even if AxisCare ever
//     returned them by surprise — this function reads only named keys.
//   payRate, payrollId       — compensation/HR data, no product need here.
//   mailingAddress            — full address not needed for a workforce
//                                profile; contact is covered by phone/email.
//   acceptableDrivingDistance — operational scheduling detail, not identity
//                                or compliance data.
//   administrators, referredBy — internal AxisCare admin metadata, no
//                                product need.

export interface AxisCareApprovedCaregiverData {
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  goesBy: string | null;
  statusActive: boolean | null;
  statusLabel: string | null;
  classes: Array<{ code: string | null; label: string | null }>;
  hireDate: string | null;
  startDate: string | null;
  terminationDate: string | null;
  regionName: string | null;
  personalEmail: string | null;
  mobilePhone: string | null;
  homePhone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  ethnicity: string | null;
  externalId: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// Extracts only the vendor identifiers a sync needs before allowlisting —
// kept separate from applyAxisCareFieldAllowlist() so a caller can compute
// the vendor_record_id/vendor_display_name without pulling in the full
// approved-data shape.
export function extractAxisCareCaregiverIdentity(raw: unknown): {
  vendorRecordId: string | null;
  vendorDisplayName: string | null;
} {
  const record = asRecord(raw);
  if (!record) return { vendorRecordId: null, vendorDisplayName: null };

  const id = record.id;
  const vendorRecordId = typeof id === "string" ? id : typeof id === "number" ? String(id) : null;

  const firstName = asString(record.firstName);
  const lastName = asString(record.lastName);
  const vendorDisplayName =
    firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : null;

  return { vendorRecordId, vendorDisplayName };
}

// The canonical identity a new, AxisCare-only workforce_members row is
// initialized with — see supabase/migrations/
// 20260812000000_add_workforce_member_canonical_identity.sql. Mirrors
// extractAxisCareCaregiverIdentity()'s own legal-name-join convention for
// displayName (never goesBy) so a canonical member's display_name and its
// primary link's vendor_display_name never silently diverge; goesBy is
// captured separately as preferredName, not yet read by any display logic
// (architected, not wired up — same "v10 architecture, v0.1 build"
// discipline as link_role='historical').
export function deriveCanonicalIdentityFromAxisCare(
  data: Pick<AxisCareApprovedCaregiverData, "firstName" | "lastName" | "goesBy">,
  vendorDisplayName: string | null
): {
  displayName: string | null;
  legalFirstName: string | null;
  legalLastName: string | null;
  preferredName: string | null;
} {
  const legalFirstName = data.firstName;
  const legalLastName = data.lastName;
  const joined = [legalFirstName, legalLastName].filter(Boolean).join(" ").trim();
  const displayName = joined.length > 0 ? joined : vendorDisplayName;

  return {
    displayName: displayName && displayName.trim().length > 0 ? displayName.trim() : null,
    legalFirstName,
    legalLastName,
    preferredName: data.goesBy,
  };
}

export function applyAxisCareFieldAllowlist(raw: unknown): AxisCareApprovedCaregiverData {
  const record = asRecord(raw) ?? {};
  const status = asRecord(record.status);
  const region = asRecord(record.region);
  const classesRaw = Array.isArray(record.classes) ? record.classes : [];

  return {
    firstName: asString(record.firstName),
    middleInitial: asString(record.middleInitial),
    lastName: asString(record.lastName),
    goesBy: asString(record.goesBy),
    statusActive: status ? asBoolean(status.active) : null,
    statusLabel: status ? asString(status.label) : null,
    classes: classesRaw.map((entry) => {
      const c = asRecord(entry);
      return { code: c ? asString(c.code) : null, label: c ? asString(c.label) : null };
    }),
    hireDate: asString(record.hireDate),
    startDate: asString(record.startDate),
    terminationDate: asString(record.terminationDate),
    regionName: region ? asString(region.name) : null,
    personalEmail: asString(record.personalEmail),
    mobilePhone: asString(record.mobilePhone),
    homePhone: asString(record.homePhone),
    dateOfBirth: asString(record.dateOfBirth),
    gender: asString(record.gender),
    ethnicity: asString(record.ethnicity),
    externalId: asString(record.externalId),
  };
}
