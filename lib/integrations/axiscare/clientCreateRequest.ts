// AxisCare's real POST /api/clients ("Add Client") request contract — hand-maintained against
// the checked-in OpenAPI spec (docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml,
// operationId `post-api-clients`, API version 2023-10-01), re-verified line-by-line against that
// spec's `requestBody` schema at authoring time (2026-09-18). This repo has no OpenAPI-to-zod
// codegen pipeline, and introducing one for a single endpoint would be disproportionate to this
// slice — a hand-authored zod schema, kept deliberately narrow to exactly this endpoint's
// documented shape, is the smallest faithful representation. Every field below traces to a named
// property in that spec; nothing here is invented. See PROPERTY NOTES for the handful of places
// the spec itself is ambiguous or asymmetric.
//
// This is the AxisCare INTEGRATION BOUNDARY's own vocabulary — real AxisCare field names
// (firstName, residentialAddress, homePhone, ...), never Serve's canonical field_path taxonomy
// (lib/assessmentIntelligence/domainRegistry.ts). Serve's assessment intelligence layer maps INTO
// this shape (lib/assessmentIntelligence/axiscareReadiness.ts); nothing downstream of that mapper
// should ever need to know AxisCare's field names, and nothing upstream of it should ever need to
// know Serve's.
//
// PROPERTY NOTES (ambiguities/asymmetries in the checked-in spec itself, not resolved here):
//
// - `status`: the spec allows either a bare string (example text "Active | Inactive", with no
//   formal enum listing exact accepted casing) OR an object requiring
//   `{ active: boolean, label: string }`. This schema only models the OBJECT form — it is the
//   exact shape the spec's own GET /api/clients response example uses
//   (`status: { active: true, label: "Active" }`), so it is corroborated by a real example rather
//   than an under-specified description string.
// - `region`: the CREATE body's `region` is documented as a plain string ("Region name"), but the
//   spec's own response examples show `region` as an object (`{ id, name }`) elsewhere on the
//   client resource. These are not the same shape. This schema follows the CREATE body's own
//   documented shape (string) exactly and does not attempt to reconcile that asymmetry.
// - `residentialAddress` / `billingAddress`: each top-level property is nullable, and its
//   description says "if specified, must provide the entire object," but the spec defines no
//   nested `required` array for the object's own sub-fields. This schema requires
//   streetAddress1/city/state/postalCode together whenever the object is provided — those four
//   are the only sub-fields the spec itself types as plain (non-nullable) `string`; `name` and
//   `streetAddress2` are the only sub-fields the spec itself types as nullable, so they remain
//   optional here. This is a literal reading of the spec's own per-field nullability, not an
//   invented constraint.
// - No `community` property exists anywhere in this create body (confirmed absent from the
//   spec's full property list for POST /api/clients), even though `community` appears on the
//   read-side Client resource in the GET /api/clients response example. Serve's
//   `residence.community` therefore has NO create-time mapping target here — deliberately
//   omitted rather than guessed onto `region` (a different, unconfirmed-equivalent concept).
// - No `responsibleParties` property exists in this create body at all. AxisCare's only
//   documented Responsible Party operations are List/Get/Update-by-list-number
//   (`/api/clients/{clientId}/responsibleParties[/{listNumber}]`) — no dedicated Create endpoint
//   is documented, and all of those require an existing `clientId`. Responsible Party data
//   (Serve's `important_people.primary_contact_*`) is therefore NOT part of this contract or this
//   slice's mapper output — see axiscareReadiness.ts's `integrationGaps` for how that is
//   surfaced instead of invented.
// - The spec's only documented success-response schema for this endpoint is a dangling
//   `$ref: ../Client.yaml`, which is not checked into this repo — the exact shape of a
//   successful CREATE response is unverifiable from what's checked in. Irrelevant to this slice
//   (only the request is built here, never sent), flagged for whoever eventually implements Send.
// - `gender` is documented only as `string | null` with description "M or F" — no formal enum.
//   This schema keeps it a plain nullable string rather than inventing an enum constraint the
//   spec itself doesn't state.
// - `classes[].code`/`classes[].label` are both documented optional ("should provide one of
//   them" is prose guidance, not a schema-level requirement) — kept exactly that loose here.
// - `conversionDate`/`startDate` are valid optional fields per the spec, but this contract's
//   companion mapper (axiscareReadiness.ts) deliberately never populates them: their operational
//   meaning inside AxisCare's own client lifecycle isn't confirmed by anything checked into this
//   repo, and Serve is creating every client INACTIVE (see AXISCARE_INACTIVE_STATUS below) —
//   guessing a conversion/start date for a client that hasn't been activated risked asserting
//   something false about a transition that hasn't happened. Left unmapped, not invented.

import { z } from "zod";

/** The API version this contract was verified against — sent as the required
 * `X-AxisCare-Api-Version` header on every request to this endpoint (not part of the JSON body
 * itself, but pinned here so the contract and the header version can never silently drift apart). */
export const AXISCARE_CLIENTS_API_VERSION = "2023-10-01";

export const AXISCARE_CLIENTS_PATH = "/api/clients";

const AxisCareAddressSchema = z.object({
  name: z.string().nullable().optional(),
  streetAddress1: z.string(),
  streetAddress2: z.string().nullable().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
});
export type AxisCareAddress = z.infer<typeof AxisCareAddressSchema>;

/** The object form of `status` — see PROPERTY NOTES above for why this contract only models this
 * form, never the bare-string alternative the spec also allows. */
const AxisCareStatusSchema = z.object({
  active: z.boolean(),
  label: z.string(),
});
export type AxisCareStatus = z.infer<typeof AxisCareStatusSchema>;

/** The one and only status value this contract's mapper is ever allowed to produce — Serve's
 * inactive-before-active policy applies to every client this codebase creates, with no
 * exception. AxisCare's own endpoint description states plainly: "a new client will be created
 * with an Active status" if `status` is omitted — so a create payload MUST always set this
 * explicitly; omitting `status` is not a safe default here the way it might be for an optional
 * field elsewhere in this contract. See axiscareReadiness.test.ts for the test proving no code
 * path can produce a create payload without this exact value. */
export const AXISCARE_INACTIVE_STATUS: AxisCareStatus = { active: false, label: "Inactive" };

const AxisCareReferredBySchema = z.object({
  id: z.number().optional(),
  type: z.string(),
  name: z.string().optional(),
});

const AxisCarePreferredCaregiverSchema = z.object({
  id: z.number().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const AxisCareClassSchema = z.object({
  code: z.string().optional(),
  label: z.string().optional(),
});

/** The complete POST /api/clients request body, exactly as documented. `firstName`/`lastName`
 * are the ONLY two fields the spec's own `required` array names — every other property here is
 * optional/nullable in the spec, regardless of what Serve's own business rules might separately
 * recommend (see axiscareReadiness.ts's `recommendedMissing`, a distinct, non-blocking concept). */
export const AxisCareClientCreateRequestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  status: AxisCareStatusSchema.optional(),
  dateOfBirth: z.string().nullable().optional(),
  ssn: z.string().nullable().optional(),
  residentialAddress: AxisCareAddressSchema.nullable().optional(),
  personalEmail: z.string().email().nullable().optional(),
  homePhone: z.string().nullable().optional(),
  mobilePhone: z.string().nullable().optional(),
  medicaidNumber: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  goesBy: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  assessmentDate: z.string().nullable().optional(),
  conversionDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  classes: z.array(AxisCareClassSchema).optional(),
  region: z.string().nullable().optional(),
  referredBy: AxisCareReferredBySchema.nullable().optional(),
  preferredCaregiver: AxisCarePreferredCaregiverSchema.nullable().optional(),
  billingAddress: AxisCareAddressSchema.nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  otherPhone: z.string().nullable().optional(),
  telephonyPhone: z.string().nullable().optional(),
  priorityNote: z.string().nullable().optional(),
});

export type AxisCareClientCreateRequest = z.infer<typeof AxisCareClientCreateRequestSchema>;
