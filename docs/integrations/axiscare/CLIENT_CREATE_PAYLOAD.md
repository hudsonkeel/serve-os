# AxisCare Client-Create Payload (Slice B.1, 2026-09-18)

## Status: payload building only. No Send-to-AxisCare action exists.

This document describes what "Preview AxisCare Payload" actually builds today. **Nothing in this
codebase POSTs, PUTs, or PATCHes AxisCare.** `lib/integrations/axiscare/client.ts` defines exactly
one function, hardcoded to `method: "GET"` — the AxisCare integration remains structurally
read-only. Building the correct request payload now (this slice) is preparation for a *future*,
separate, human-triggered "Send to AxisCare" action — not that action itself.

## Governing lifecycle (unchanged, preserved by this slice)

```
assessment knowledge
  → approved Current Assessment
  → signed Service Agreement establishes ServeRelationship = inactive_client
  → human Send to AxisCare        (NOT YET BUILT — this slice only prepares its payload)
  → later, separate human Activate Client
```

Assessment completeness, pricing completeness, and Cinch-projection completeness authorize none
of these transitions. There is no algorithmic activation anywhere in this codebase.

## Source of truth: the checked-in AxisCare OpenAPI spec

`docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml`, operation `post-api-clients`
("Add Client"), API version `2023-10-01`.

- **Endpoint:** `POST /api/clients`
- **Required header:** `X-AxisCare-Api-Version: 2023-10-01`
- **Required body fields:** `firstName`, `lastName` — the spec's own `required` array names
  exactly these two and nothing else.
- **Documented default:** *"a new client will be created with an Active status"* if `status` is
  omitted. This is why Serve's mapper (`buildAxisCareClientCreatePayload()`) **always** sets
  `status` explicitly — it is never a safe field to leave out.
- **Optional/nullable fields present in the spec:** `status`, `dateOfBirth`, `ssn`,
  `residentialAddress`, `personalEmail`, `homePhone`, `mobilePhone`, `medicaidNumber`,
  `externalId`, `goesBy`, `gender`, `assessmentDate`, `conversionDate`, `startDate`, `classes`,
  `region`, `referredBy`, `preferredCaregiver`, `billingAddress`, `billingEmail`, `otherPhone`,
  `telephonyPhone`, `priorityNote`.
- **`status`:** the spec allows either a bare string (example text "Active | Inactive", no formal
  enum) or an object `{ active: boolean, label: string }`. Serve's contract
  (`lib/integrations/axiscare/clientCreateRequest.ts`) only models the object form, since it's
  the exact shape the spec's own `GET /api/clients` response example uses.
- **Address structure** (`residentialAddress`/`billingAddress`, identical shape): `name`
  (nullable), `streetAddress1` (required-shaped — non-nullable string), `streetAddress2`
  (nullable), `city`/`state`/`postalCode` (required-shaped). The spec says "if specified, must
  provide the entire object" but defines no nested `required` array — Serve's schema requires
  the four non-nullable sub-fields together and treats `name`/`streetAddress2` as optional,
  reading the spec's own per-field nullability literally.
- **Phone/email structure:** plain optional strings — `homePhone`, `mobilePhone`, `otherPhone`,
  `personalEmail`, `billingEmail`, `telephonyPhone` (examples: home/mobile/other/unrestricted).
  No structured phone-type object at the top level of the client record itself.
- **External identifier field:** `externalId` (nullable string) — exactly what a caller-supplied
  back-reference is for. Serve's mapper sets this to the resident's own Serve UUID.
- **Nested objects:** `referredBy` ({id, type (required if object given), name}),
  `preferredCaregiver` ({id, firstName, lastName}), `classes` (array of {code, label}).
- **Responsible Party support:** **none, in this endpoint.** No `responsibleParties` property
  exists anywhere in the `POST /api/clients` body. AxisCare's only documented Responsible Party
  operations are `GET`/`PUT` by list-number slot
  (`/api/clients/{clientId}/responsibleParties[/{listNumber}]`) — there is no documented
  dedicated *create* endpoint, and every one of those operations requires an existing `clientId`.
  The Update operation's own spec text states *"None of the fields are required."*

## Ambiguities/asymmetries flagged, not guessed around

- **`region` vs. `community`:** the create body's `region` is a plain string ("Region name"), but
  the spec's own response examples show `region` as an object (`{id, name}`) elsewhere on the
  client resource — these are not the same shape. Separately, **no `community` property exists
  in the create body at all**, even though `community` appears on the read-side client resource.
  Serve's `residence.community` (partner-community affiliation) therefore has **no confirmed
  create-time mapping target** — omitted from the payload rather than guessed onto `region`.
  Surfaced to the operator as an integration gap when the resident has a known community.
- **Responsible Party creation mechanics are unconfirmed.** Before a real Send-to-AxisCare write
  is ever built, this needs verification with AxisCare beyond this checked-in spec file.
- **The success-response schema for `POST /api/clients`** is a dangling `$ref: ../Client.yaml`
  not checked into this repo — irrelevant to building a request, flagged for whoever eventually
  implements Send.

## Serve → AxisCare field mapping

| Serve source | AxisCare field | Notes |
|---|---|---|
| `residents.first_name` (canonical resident record) | `firstName` | **API hard blocker if absent** — the only two fields AxisCare's contract itself requires. |
| `residents.last_name` (canonical resident record) | `lastName` | Same. |
| — (always set) | `status` | Always `{ active: false, label: "Inactive" }` — Serve's inactive-before-active policy, never omitted. |
| `residents.id` (Serve's own UUID) | `externalId` | A real, non-invented back-reference AxisCare's contract documents for exactly this purpose. |
| Approved fact `identity.date_of_birth`, else canonical profile DOB | `dateOfBirth` | Recommended, non-blocking if absent. Assessment wins over canonical profile. |
| Approved fact `identity.phone`, else canonical profile phone | `homePhone` | Serve doesn't track phone *type*; mapped to `homePhone` as the more conservative default — a mapping judgment call over a real confirmed value, not an invented value. |
| Approved fact `identity.email` | `personalEmail` | No canonical-profile fallback (none exists in the established canonical-facts architecture). |
| Approved fact `identity.preferred_name` | `goesBy` | Direct conceptual match. |
| Approved facts `residence.address_line1`/`city`/`state`/`postal_code` (all four, assessment-then-canonical per field), plus `residence.apartment_unit` | `residentialAddress` | Only included when all four core sub-fields resolve — a partial address is omitted entirely, never sent incomplete. |
| Assessment session date (`finished_at ?? started_at`) | `assessmentDate` | Direct conceptual match to AxisCare's own documented field. |
| Approved fact `important_people.primary_contact_phone` | *(none)* | **No create-time mapping target exists.** This is Responsible Party data, and Responsible Party has no home in this contract at all — see Responsible Party section above. Kept as a Serve-recommended field, surfaced separately from the payload. |
| `residence.community` / canonical `communityId` | *(none)* | No confirmed equivalent field — see ambiguities above. |
| `ssn`, `medicaidNumber`, `classes`, `region`, `referredBy`, `preferredCaregiver`, `billingAddress`, `billingEmail`, `otherPhone`, `telephonyPhone`, `priorityNote`, `gender`, `conversionDate`, `startDate` | *(none)* | No corresponding Serve source exists in the current data model, or (conversionDate/startDate specifically) their operational meaning inside AxisCare's own lifecycle isn't confirmed by anything checked into this repo — left unmapped rather than guessed. |

## Readiness model — four distinct categories, never collapsed

`evaluateAxisCareClientCreate()` (`lib/assessmentIntelligence/axiscareReadiness.ts`) returns:

1. **API hard blockers** — an actual AxisCare-required field is missing (today: first/last name only).
2. **Process hard blockers** — Serve's own identity-duplicate-reconciliation safety gate. Independent of field completeness; a complete profile never overrides this.
3. **Recommended missing** — date of birth, primary contact phone. Never AxisCare-required; never block a preview or a technically-valid create payload.
4. **Integration gaps** — Responsible Party (always), and community affiliation (when the resident has one). Informational only.

`technicallyReady` is true exactly when there are zero API hard blockers and zero process hard
blockers — independent of recommended-missing or integration-gap counts. The payload itself is
built (and schema-validated) whenever `technicallyReady` is true.

## What this slice explicitly does NOT do

- Does not send anything to AxisCare.
- Does not build a Send-to-AxisCare action.
- Does not create or write a Responsible Party.
- Does not change enrollment (Service Agreement → inactive_client) or activation semantics.
- Does not change pricing or Cinch projection behavior — neither participates in this readiness
  computation at all (the function signature accepts no pricing or Cinch input).
