# AxisCare ↔ Serve Canonical Client Fact Source Matrix

Status: transition-phase integration contract, approved 2026-08-17. This is
the durable reference for "where does each Serve canonical client fact
come from, and who is allowed to write it." Update this file whenever the
bootstrap's field set, ownership rules, or Client Readiness's requirement
set changes — do not let it drift silently out of sync with
`lib/integrations/axiscare/clientCanonicalSync.ts` /
`clientCanonicalApply.ts` / `lib/clientReadiness/evidence.ts`.

**AxisCare is not Serve's canonical client schema.** This matrix exists so
that never becomes true by accident — every row states an explicit Serve
target and an explicit future-owner, even for facts AxisCare currently
supplies.

## Governing architecture

```
TRANSITION (now)
  AxisCare (existing operational data, entered during audit cleanup)
    -> governed source snapshot (axiscare_client_canonical_snapshot)
    -> confirmed Serve<->AxisCare identity (person_vendor_identity_links, status='confirmed')
    -> canonical Serve client facts/evidence (residents columns / person_evidence)
    -> Client Readiness / Audit Readiness (reads Serve canonical data only, never AxisCare live)

STEADY STATE (future)
  Serve Assessment / Serve-native workflows
    -> canonical Serve client facts (written first, by Serve)
    -> Client Readiness / Audit Readiness
    -> approved downstream projection/write-back to AxisCare (not built — see Non-Goals)
```

## Fact source matrix

| Serve canonical field/fact | Client Readiness requirement | Assessment domain | Current operational source | AxisCare location | Exact API field | Deterministic? | Provenance required | Conflict behavior | Future Serve-native owner | Future AxisCare write-back |
|---|---|---|---|---|---|---|---|---|---|---|
| `residents.date_of_birth` | `CR_CLIENT_PROFILE_ON_FILE` | `identity.date_of_birth` | AxisCare (bootstrap) | Client Profile | `GET /api/clients/{id}` → `dateOfBirth` | Yes | `axiscare_client_canonical_snapshot.fetched_at` + confirmed identity link | Serve-owned value never overwritten; disagreement → `conflict_unresolved`, human review | Serve Assessment / resident intake | `PATCH /api/clients/{id}` (supported by AxisCare, not built) |
| `residents.gender` | `CR_CLIENT_PROFILE_ON_FILE` | not in taxonomy | AxisCare (bootstrap) | Client Profile | `GET /api/clients/{id}` → `gender` | Yes | same | same | Serve Assessment / resident intake | same, unbuilt |
| `residents.date_of_admission` | `CR_CLIENT_PROFILE_ON_FILE` | not in taxonomy | AxisCare (bootstrap) | Client Profile | `GET /api/clients/{id}` → `startDate` | Yes | same | same | Serve Assessment / resident intake | same, unbuilt |
| `residents.address` (combined) | `CR_CLIENT_PROFILE_ON_FILE` (service location, OR'd with `building`) | `residence.address_line1` | AxisCare (bootstrap) | Client Profile | `GET /api/clients/{id}` → `residentialAddress.streetAddress1/2` | Yes | same | same | Serve Assessment / resident intake | same, unbuilt |
| `residents.city` / `state` / `zip_code` | `CR_CLIENT_PROFILE_ON_FILE` | `residence.*` | AxisCare (bootstrap) | Client Profile | `residentialAddress.city/state/postalCode` | Yes | same | same | Serve Assessment / resident intake | same, unbuilt |
| `residents.building` (unit) | `CR_CLIENT_PROFILE_ON_FILE` | `residence.apartment_unit` | Serve-native (already populated) | — | not mapped — Serve's own community/unit model, not AxisCare's | — | — | — | Serve (unchanged) | N/A |
| `EP_CLIENT_TRIAGE_CLASSIFIED` evidence | `EP_CLIENT_TRIAGE_CLASSIFIED` | not in taxonomy | AxisCare (bootstrap), leadership-confirmed same artifact | Client Profile → Triage Level | `GET /api/clients/{id}` → `triageLevel.{id,description}` | Yes (leadership-confirmed same real-world classification) | `person_evidence.satisfaction_context='triage_classification_axiscare_sourced'`, `authoritative_source_system='axiscare'`, `external_reference`=AxisCare client id, `effective_date`=snapshot `fetched_at` | Evidence-existence based, not column comparison: once ANY active evidence exists for this requirement+resident, AxisCare never creates a second row — see `recordAxisCareTriageEvidence()` | Serve-native triage review/reassessment workflow | Not applicable — Serve triage becomes authoritative once owned |
| `residents.family_contact_name/relationship/phone/email` | not directly a requirement; supports `important_people` completeness elsewhere | `important_people.primary_contact_*` / `emergency_contact` | AxisCare Responsible Parties (bootstrap) | Responsible Parties tab, position 1 | `GET /api/clients/{id}/responsibleParties` → `[0].name/relationship/phones[].number/email` | Yes, for the fields themselves — **not** a guardian determination | same as core fields | same | Serve Assessment / resident intake | `PUT /api/clients/{id}/responsibleParties/{listNumber}` (supported, not built) |
| `residents.legal_guardian_name/phone` | `CR_CLIENT_PROFILE_ON_FILE` | `important_people.decision_maker` | **Human-entered / attested only** | Responsible Parties `canMakeMedicalDecisions`/`hipaaDisclosureAuthorization` — present in the API but **empty on every sampled record in this account** | n/a — not deterministically mappable today | **No** | Requires a human confirmation (`guardian_confirmed_none` attestation or a real name+phone entered by staff) | N/A — never auto-populated from AxisCare | Serve Assessment / staff entry | Not applicable |
| `residents.physician_name/phone` | `CR_CLIENT_PROFILE_ON_FILE` | not in taxonomy | **Human-entered only** | AxisCare Contact, `contactClass='Physician'`, would link via `clients[]` | `GET /api/contacts` → `clients[]` (mechanism real, **zero linkage populated for any client in this account**) | Mechanism yes; data no — nothing to import today | N/A until real linkage exists | N/A | Serve Assessment / staff entry (or AxisCare bootstrap, once real linkage exists) | `PATCH /api/contacts/{id}` to add `clients[]` linkage (supported, not built, not Serve's to fix) |
| `CR_ASSESSMENT_CURRENT` evidence | `CR_ASSESSMENT_CURRENT` | all domains | **Serve Assessment only** | — | not applicable — AxisCare has no equivalent concept | N/A | Serve-native (`assessment_approved` satisfaction_context) | N/A | Serve Assessment (already the owner) | Future: approved facts projected to AxisCare |
| `CR_ISP_ON_FILE_AND_CURRENT` evidence | `CR_ISP_ON_FILE_AND_CURRENT` | `daily_life.*` (care-plan-adjacent) | AxisCare Documents (UI), **not API-accessible** | Documents tab | No document endpoint in the Customer API | No — `EXISTS_EXTERNAL_TO_SERVE` | Manual upload, existing `recordDocumentEvidence()` path | N/A | Serve-native document governance | N/A — no write path either |
| `CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED` / `CR_BILLING_AGREEMENT_ON_FILE` evidence | same codes | — | AxisCare Documents (UI), **not API-accessible** | Documents tab | No document endpoint | No — `EXISTS_EXTERNAL_TO_SERVE` | Manual upload | N/A | Serve-native document governance | N/A |
| `CR_SUPERVISORY_VISIT_RECORDED` evidence | same | — | AxisCare Documents (UI), **not API-accessible** | Documents tab | No document endpoint | No — `EXISTS_EXTERNAL_TO_SERVE` | Manual upload | N/A | Serve-native, mobile workflow (deferred) | N/A |
| `CR_DISCHARGE_SUMMARY_ON_FILE` evidence | same | — | AxisCare Documents (UI), **not API-accessible** | Documents tab | No document endpoint | No — `EXISTS_EXTERNAL_TO_SERVE` | Manual upload | N/A | Serve-native document governance | N/A |
| `CR_MEDICATION_LIST_ON_FILE` evidence | `CR_MEDICATION_LIST_ON_FILE` | — | Physical client folder only, by design | — | Deliberately never sourced from any digital system, AxisCare included | No — by design, not a capability gap | Verify From Source attestation (unchanged) | N/A | Physical folder (permanent, not a transition state) | N/A |
| `CR_CARE_DOCUMENTATION_CURRENT` evidence | `CR_CARE_DOCUMENTATION_CURRENT` | — | Human Verify-From-Source over AxisCare visit/care notes (unchanged v0.1 behavior) | Visits / Care Notes | `GET /api/visits` (already integrated elsewhere) | Partially — see Deferred Enhancements below | Existing `care_documentation_verified` attestation | N/A | Serve-native care documentation (future) | N/A |

## Fields inspected and explicitly excluded (not needed by Serve, or not safely importable)

| AxisCare field | Classification | Why |
|---|---|---|
| `ssn` | `API_AVAILABLE_REQUIRES_HUMAN_REVIEW` → excluded entirely | Never needed by Client Readiness; gated behind `requestedSensitiveFields`, deliberately never requested |
| `medicaidNumber` | `API_AVAILABLE_DETERMINISTIC` → excluded | No Client Readiness requirement needs it |
| `advanceDirective`, `dnr`, `will` | `API_AVAILABLE_DETERMINISTIC` → excluded this phase | Advance Directives was explicitly deferred in Client Readiness's own Phase A.2 decisions (split into Assessment/Service Agreement, not this bootstrap) |
| `allergies` | `API_AVAILABLE_REQUIRES_HUMAN_REVIEW` → excluded | Clinical field, no current Client Readiness requirement targets it; would need a governed clinical-data decision separate from this bootstrap |
| `maritalStatus`, `spouseName`, `languages` | `API_AVAILABLE_DETERMINISTIC` → excluded | Not needed by any current Client Readiness requirement |
| Billing/charge fields | Not modeled by this integration at all | Explicit long-standing policy (`types.ts`) |
| Free-text notes (`/api/notes/client/{id}`) | `API_AVAILABLE_REQUIRES_HUMAN_REVIEW` → excluded | Narrative content, never imported per explicit instruction |
| ADL/current-care data | `API_AVAILABLE_DETERMINISTIC` mechanism, `SUPPORTED + EMPTY` in this account | Zero ADL records for any of the 4 sampled clients; revisit only once real data exists |
| Documents/attachments (all forms) | `NOT_SUPPORTED` — confirmed absent from the entire API surface | No document/attachment/file endpoint exists anywhere in the Customer API |

## Non-goals (explicit)

- AxisCare never becomes Serve's canonical client schema — every fact above has a named future Serve-native owner.
- No write-back to AxisCare is built in this phase (the write endpoints exist per the spec; none are used).
- No document sync — the capability doesn't exist in the API.
- No medication content digitization, ever, by design.
- No automatic identity-match confirmation — only human-confirmed `person_vendor_identity_links` participate.
