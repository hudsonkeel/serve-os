// AxisCare Client/ResponsibleParty/ADL WRITE payload shapes — sourced directly from AxisCare's
// own OpenAPI 3.1.0 specification (version 2025-06-25, supplied by Hud outside this repository;
// version cited the same way types.ts already cites the read-side spec). These are DRY-RUN /
// candidate-generation types only — nothing in this file or anywhere importing it sends an HTTP
// request. lib/integrations/axiscare/client.ts remains GET-only by construction; that does not
// change here. See docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md for the standing policy
// and docs/integrations/AXISCARE_WRITE_POLICY_PROPOSAL.md for the proposed amendment this work
// produced (not yet authorized).
//
// Every field below is deliberately optional/nullable to match the real spec exactly — POST
// requires only firstName+lastName; PATCH requires nothing (true partial update, send only
// changed keys). Two spec ambiguities are flagged inline rather than silently resolved — see
// each comment.

export interface AxisCareAddressWrite {
  name: string | null;
  streetAddress1: string;
  streetAddress2: string | null;
  city: string;
  state: string;
  postalCode: string;
}

export interface AxisCareClassRefWrite {
  code?: string;
  label?: string;
}

export interface AxisCareReferredByWrite {
  id?: number;
  type: string; // e.g. client | caregiver | contact | organization | other
  name?: string;
}

export interface AxisCarePreferredCaregiverWrite {
  id?: number;
  firstName?: string;
  lastName?: string;
}

/** POST /api/clients body. Required: firstName, lastName. */
export interface AxisCareClientCreateBody {
  firstName: string;
  lastName: string;
  status?: string | { active: boolean; label: string };
  dateOfBirth?: string | null; // YYYY-MM-DD
  residentialAddress?: AxisCareAddressWrite | null; // if present, ALL sub-fields required by AxisCare
  personalEmail?: string | null;
  homePhone?: string | null;
  mobilePhone?: string | null;
  externalId?: string | null;
  goesBy?: string | null;
  assessmentDate?: string | null; // YYYY-MM-DD
  startDate?: string | null; // YYYY-MM-DD
  classes?: AxisCareClassRefWrite[];
  region?: string | null;
  referredBy?: AxisCareReferredByWrite | null;
  preferredCaregiver?: AxisCarePreferredCaregiverWrite | null;
  billingAddress?: AxisCareAddressWrite | null;
  billingEmail?: string | null;
  otherPhone?: string | null;
  priorityNote?: string | null;
  // Deliberately NEVER mapped: ssn (explicit instruction — Serve does not send SSN to AxisCare).
}

/** PATCH /api/clients/{clientId} body. True partial update — every key optional, send only
 * changed fields. NOTE (spec ambiguity, not silently resolved): the PATCH body names this field
 * `referredCaregiver`, while the POST body's equivalent is `preferredCaregiver` — same shape,
 * different key name in the spec text. Very likely a spec typo, but both are kept distinct here
 * rather than guessed into one. */
export interface AxisCareClientUpdateBody {
  firstName?: string; // "if specified, must also include lastName"
  lastName?: string; // "if specified, must also include firstName"
  status?: string | { active: boolean; label: string };
  dateOfBirth?: string | null;
  residentialAddress?: AxisCareAddressWrite | null;
  personalEmail?: string | null;
  homePhone?: string | null;
  mobilePhone?: string | null;
  externalId?: string | null;
  goesBy?: string | null;
  assessmentDate?: string | null;
  startDate?: string | null;
  classes?: AxisCareClassRefWrite[];
  region?: string | null;
  referredBy?: AxisCareReferredByWrite | null;
  referredCaregiver?: AxisCarePreferredCaregiverWrite | null; // see NOTE above
  billingAddress?: AxisCareAddressWrite | null;
  billingEmail?: string | null;
  otherPhone?: string | null;
  priorityNote?: string | null;
}

export interface AxisCareResponsiblePartyPhoneWrite {
  listNumber: 1 | 2; // "used if you want to update only 2nd number and not change 1st one"
  type: "Home" | "Mobile" | "Fax" | "Work" | "Other" | null; // write-side enum has no "Office" (read-side does)
  number: string | null;
}

/** PUT /api/clients/{clientId}/responsibleParties/{listNumber} body. listNumber path param is
 * 1|2|3 (Primary/Secondary/Tertiary) — fixed pre-allocated slots, no POST/create exists.
 * "None of the fields are required." hipaaDisclosureAuthorization/canMakeMedicalDecisions are
 * real booleans on write (they come back as '0'/'1'/'' strings on read — different shape). */
export interface AxisCareResponsiblePartyWrite {
  name?: string | null;
  relationship?: string | null;
  address?: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  phones?: AxisCareResponsiblePartyPhoneWrite[];
  email?: string | null;
  dateOfBirth?: string | null;
  hipaaDisclosureAuthorization?: boolean | null;
  canMakeMedicalDecisions?: boolean | null;
}

/** POST /api/clients/{clientId}/adls body — ASSIGNS an existing agency-configured ADL
 * definition (by `id`) to the client; does not create a new ADL type. `id` must reference a real
 * entry from GET /api/adls (see lib/integrations/axiscare/adls.ts's getAllConfiguredAdls()) —
 * never invented. */
export interface AxisCareAdlEventWrite {
  require: 1 | 2; // 1 = Always required, 2 = As needed (write-side excludes 3=Never; that's read-only derived)
  recur: "N" | "M" | "T" | "W" | "R" | "F" | "S"; // Sun..Sat
  when?: 0 | 1 | 2 | 3 | 4; // 0=Any time (default), 1=Morning, 2=Afternoon, 3=Evening, 4=Night
}

export interface AxisCareAdlAssignBody {
  id: number; // the ADL definition ID being assigned — required
  instructions?: string | null;
  translations?: Partial<Record<"es" | "zh-CN" | "zh-TW" | "ru", string | null>>;
  events: AxisCareAdlEventWrite[]; // required, minItems 1
}

/** PATCH /api/clients/{clientId}/adls/{adlId} — true partial update; when `events` is provided
 * it REPLACES all existing events for that assignment (not merged). At least one field required. */
export interface AxisCareAdlUpdateBody {
  instructions?: string | null;
  translations?: Partial<Record<"es" | "zh-CN" | "zh-TW" | "ru", string | null>>;
  events?: AxisCareAdlEventWrite[];
}

/** POST /api/notes/{entityType}/{entityId} — entityType is a PATH param (e.g. "client"), not a
 * body field. Correct usage for a client note: POST /api/notes/client/{clientId}. */
export interface AxisCareNoteCreateBody {
  note: string; // required, minLength 1
  dateTime?: string; // YYYY-MM-DDTHH:mm:ss, defaults to now if omitted
  important?: boolean; // defaults to false
}
