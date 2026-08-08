# Resident Profile and Status Governance

Post-Release Stabilization, Workstream 2. Investigation findings, the
implemented model, and the specific AxisCare status mapping proposal
required by the stop condition below.

## Current resident model (as found on `main`)

- **`public.residents`** — one row per resident, ~40 columns. Notable groups:
  - Identity/demographic: `first_name`, `middle_name`, `last_name`, `preferred_name`, `display_name`, `full_name`, `date_of_birth`, `sex`, `gender`, `preferred_language`.
  - Contact: `email`, `phone`, `phone_raw`, `phone_type`, `address`, `city`, `state`, `country`, `zip_code`.
  - Placement: `community_name`, `community_code`, `building`, `unit_number`.
  - Lifecycle: `status`, `relationship_status`, `resident_type`, `is_active`.
  - Provenance: `source_system`, `source_file`, `source_status`, `import_batch`, `external_source_key`, `created_at`, `updated_at`.
  - Care: `care_needs`, `mobility`, `date_of_admission`.
  - Family: `family_contact_name`, `family_contact_relationship`, `family_contact_phone`, `family_contact_email`.
  - `notes`, `needs_review`.
- **Existing editable fields (found already live on `main`, before this change):** `preferred_name` (via `updateRelationshipDetails`, not directly on `residents`), `email`, `phone`, `date_of_birth`, `date_of_admission`, `preferred_language`, `mobility`, and all four `family_contact_*` fields — via `lib/actions/residents.ts#saveResidentProfile`/`saveFamilyContact`, wired to `components/residents/ResidentProfileCard.tsx`/`FamilyContactsCard.tsx`.
- **Roster-import-populated fields:** identity, placement, and provenance columns above are populated by the Watermere roster import pipeline (not yet merged to `main` — tracked separately as `CAP-ROSTER-001`). On `main` today, without that pipeline, these are populated by whatever process originally seeded the table.
- **Existing RPCs touching residents:** `convert_external_prospect_to_new_resident`, `convert_external_prospect_to_existing_resident`, `convert_external_prospect_to_active_client` (all in `lib/data/externalClients.ts`) — resident creation/conversion paths, not profile editing.
- **RLS:** `residents` follows the repository-wide convention — RLS enabled, zero policies, `service_role` bypasses entirely. All reads/writes go through server-side code using the service-role client; there is no row-level restriction by role at the database layer. Role enforcement is therefore an **application-layer** responsibility.
- **Roles found:** `admin`, `manager`, `executive`, `operations` (`lib/auth/constants.ts`).
- **Permission gap found (fixed by this workstream):** neither `saveResidentProfile` nor `saveFamilyContact` performed any role check prior to this change — every authenticated user, regardless of role, could edit any resident's profile fields including date of birth. This was a real, disclosed gap, not a hypothetical one.

## Does AxisCare already supply client status?

**No — not in any form this codebase currently captures or types.** `lib/integrations/axiscare/clients.ts` is a discovery-only stub (`getClientSample()`, `limit=1`, never wired into any sync pipeline or UI). Its response type, `AxisCareClientsResponse`, declares `clients?: unknown` — the shape of an individual client record, including any status field, **has never been inspected or typed in this codebase.** There is no live AxisCare status sync anywhere in Serve OS today.

This triggers the task's own stop condition directly: *"If AxisCare status mapping is unclear or the API does not currently expose the needed status, implement the safe profile editor and produce a specific mapping proposal rather than inventing status logic."* Accordingly, no AxisCare status sync or mapping logic was implemented — only proposed below.

## Source-of-truth matrix (implemented)

| Field group | Owner | Editable by Serve staff | Notes |
|---|---|---|---|
| `preferred_name`, `email`, `phone`, `date_of_birth`, `date_of_admission`, `preferred_language`, `mobility` | Serve | **Yes** (already existed; now role-gated) | |
| `family_contact_*` (4 fields) | Serve | **Yes** (already existed; now role-gated) | |
| `first_name`, `last_name`, `display_name`, `full_name`, `community_name`, `community_code`, `unit_number`, `building` | Import/roster provenance | No — read-only | Changing these outside the import pipeline risks breaking roster/identity reconciliation matching; not touched by this workstream |
| `source_system`, `source_file`, `source_status`, `import_batch`, `external_source_key`, `created_at`, `updated_at` | Import provenance | No — read-only, now source-labeled in the UI | Displayed as "from {source_system}" + a "Last Synced" date on the resident profile card |
| `status`, `relationship_status`, `resident_type`, `is_active` | Existing Serve-domain lifecycle fields, roster-derived — **not** a live AxisCare sync | No — read-only (unchanged; editing lifecycle status was not implemented this pass, see below) | These already represent something distinct from a literal AxisCare API status (there is no live AxisCare status to duplicate) — no new status concept was invented |
| `care_needs`, `notes` | Serve | Not wired to UI this pass | Out of scope for this stabilization pass; flagged as a real gap, not silently dropped |

## What was implemented

1. **Role-based permission gate** (`lib/auth/permissions.ts#canEditResidentProfile`) — `admin`/`manager`/`executive` only, matching the existing Workforce document-access convention. `operations` is deliberately excluded.
2. **Server-side enforcement** in both `saveResidentProfile` and `saveFamilyContact` (`lib/actions/residents.ts`) — the actual security boundary; the UI gate is a convenience layered on top, not the guarantee.
3. **Client-side gating** — the Edit button on both cards is hidden entirely for a `canEdit={false}` viewer.
4. **Source labeling** — "Resident Type" and "Resident Status" now show "from {Source System}" inline; a new "Last Synced" field shows the resident row's `updated_at`/`created_at`.
5. **Audit trail** — a `profile_updated` event now lands in `resident_timeline` on every successful save (actor, section, timestamp), reusing the existing timeline mechanism rather than inventing a new one. One small additive migration (`20260818000000_add_resident_profile_update_event.sql`) extends `resident_timeline.event_type`'s check constraint — the same pattern already used three times in this repository's history. **Not applied** to the live database as part of this work.

## What was explicitly not implemented (and why)

- **AxisCare status sync/mapping** — blocked by the stop condition above (API shape unknown). See the proposal below.
- **Editing `unit_number`/`building`/`care_needs`/`notes`** — the task's own examples list these as candidate Serve-owned fields, but wiring them into the UI was judged lower-priority than closing the permission gap within this stabilization pass's scope; flagged here rather than silently omitted.
- **A new "Serve-specific operational status"** — not created. `relationship_status`/`resident_type`/`is_active` already exist and already represent something Serve-specific (they are not literal mirrors of any live AxisCare status, since none exists); inventing a new status field alongside them would be exactly the duplication the task warns against.

## AxisCare status mapping proposal (not implemented — proposal only)

Before any live AxisCare status sync is built, the following needs to happen, in order:

1. **Inspect one real client record.** `getClientSample()` already exists and works (`lib/integrations/axiscare/clients.ts`) — it has simply never had its `limit=1` response's `clients` object logged/typed. This is a required first step, not an assumption to skip.
2. **Identify AxisCare's actual status field(s) and enum values** from that real response (likely candidates based on AxisCare's general domain: an active/inactive flag, a client status/sub-status string, and a termination/inactivation date — but these are **not confirmed** and must not be assumed).
3. **Decide the mapping**, once real values are known — e.g. AxisCare "Active" → a new read-only `axiscare_status` column (not overwriting `status`/`relationship_status`, which remain Serve-owned); AxisCare "Inactive"/"Terminated" → same, distinct column, with the termination reason/date if the API provides one.
4. **Add a real sync pipeline** (not the current `limit=1` discovery stub) with its own migration, mirroring the caregiver sync pattern already proven in `lib/workforce/axiscareCaregiverSync.ts` (allowlisted fields, confirmed-link-before-write discipline).
5. **Display it read-only, source-labeled "from AxisCare"** on the resident profile — never editable from Serve OS, per the task's own instruction ("unless the existing architecture clearly permits writes back to AxisCare" — it does not; this is a read-only integration by design, see `docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md`).

This is intentionally a plan, not code — implementing it now would mean inventing status values that have never been confirmed against AxisCare's real API response, which is exactly what the stop condition prohibits.
