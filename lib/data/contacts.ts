import "server-only";
import { createServerClient } from "../supabase/server.ts";

// Data layer for the Slice C.2 canonical contact tables (supabase/migrations/
// 20260919000000_create_canonical_contacts.sql), consumed by Slice C.3's Important People
// projection. Every write here is service-role only, matching the rest of this repo's governed
// tables (person_evidence, assessment_approved_facts, etc.) — no direct authenticated-browser
// write path exists or is added.

export interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  normalized_email: string | null;
  phone: string | null;
  normalized_phone: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ContactRoleRow {
  id: string;
  contact_id: string;
  resident_id: string;
  role_type: string;
  status: string;
  source: string;
  source_reference: string | null;
  evidence_id: string | null;
  effective_start: string;
  effective_end: string | null;
  created_by: string;
  created_at: string;
}

export async function getContactById(contactId: string): Promise<ContactRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  if (error) {
    console.error("[getContactById]", { contactId, message: error.message });
    return null;
  }
  return data as ContactRow | null;
}

export async function createContact(input: {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  createdBy: string;
}): Promise<ContactRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert([
      {
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        normalized_phone: input.normalizedPhone,
        created_by: input.createdBy,
      },
    ])
    .select("*")
    .single();
  if (error || !data) {
    console.error("[createContact]", { message: error?.message });
    return null;
  }
  return data as ContactRow;
}

/** Sets a contact field ONLY when it is currently empty — never overwrites an existing,
 * possibly-conflicting current value. Callers decide separately whether to also record
 * provenance (see recordContactFieldProvenance) regardless of whether this update actually
 * changed anything. */
export async function setContactFieldIfEmpty(
  contactId: string,
  field: "first_name" | "last_name" | "phone" | "normalized_phone",
  value: string,
  updatedBy: string
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("contacts")
    .update({ [field]: value, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .is(field, null);
  if (error) {
    console.error("[setContactFieldIfEmpty]", { contactId, field, message: error.message });
  }
}

/** Idempotent by (contact_id, field_name, source_reference): if a provenance row already
 * recording this exact assertion exists, does nothing rather than inserting a redundant
 * duplicate — this is what keeps a retried/duplicate confirm click from piling up repeated
 * identical history rows for the same already-recorded assessment fact. A genuinely NEW value
 * for the same field (different source_reference, e.g. a later manual correction) always
 * inserts its own new row — this only de-duplicates the exact same (contact, field, source)
 * triple, never collapses two different assertions into one. */
export async function recordContactFieldProvenance(input: {
  contactId: string;
  fieldName: "first_name" | "last_name" | "email" | "phone";
  value: string;
  source: "assessment" | "manual" | "document" | "axiscare" | "other";
  sourceReference: string | null;
  assertedBy: string;
}): Promise<void> {
  const supabase = createServerClient();
  if (input.sourceReference) {
    const { data: existing, error: lookupError } = await supabase
      .from("contact_field_provenance")
      .select("id")
      .eq("contact_id", input.contactId)
      .eq("field_name", input.fieldName)
      .eq("source_reference", input.sourceReference)
      .maybeSingle();
    if (lookupError) {
      console.error("[recordContactFieldProvenance:lookup]", { contactId: input.contactId, message: lookupError.message });
    }
    if (existing) return;
  }
  const { error } = await supabase.from("contact_field_provenance").insert([
    {
      contact_id: input.contactId,
      field_name: input.fieldName,
      value: input.value,
      source: input.source,
      source_reference: input.sourceReference,
      asserted_by: input.assertedBy,
    },
  ]);
  if (error) {
    console.error("[recordContactFieldProvenance]", { contactId: input.contactId, message: error.message });
  }
}

/** All contact_roles rows for a resident, together with their contact — the "Current Important
 * People" read path. */
export async function getContactRolesForResident(
  residentId: string
): Promise<(ContactRoleRow & { contact: ContactRow })[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("contact_roles")
    .select("*, contact:contacts(*)")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[getContactRolesForResident]", { residentId, message: error.message });
    return [];
  }
  return (data as (ContactRoleRow & { contact: ContactRow })[] | null) ?? [];
}

/** The set of assessment_approved_facts ids already canonicalized into a contact_roles row for
 * this resident — the idempotency/already-resolved key (see
 * lib/contacts/importantPeopleResolution.ts). Only 'assessment'-sourced rows are relevant here;
 * a manually-entered role has no approved-fact id to match against. */
export async function getAssessmentSourcedRoleReferencesForResident(residentId: string): Promise<Set<string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("contact_roles")
    .select("source_reference")
    .eq("resident_id", residentId)
    .eq("source", "assessment");
  if (error) {
    console.error("[getAssessmentSourcedRoleReferencesForResident]", { residentId, message: error.message });
    return new Set();
  }
  return new Set(
    ((data as { source_reference: string | null }[] | null) ?? [])
      .map((r) => r.source_reference)
      .filter((ref): ref is string => ref !== null)
  );
}

/** Idempotent by (resident_id, source_reference): the caller (lib/actions/importantPeople.ts)
 * already filters requested roles down to only the missing ones via computeMissingRoleInserts()
 * before calling this, but this defensive re-check protects against a genuine race (two
 * near-simultaneous confirm requests for the same proposal) that filter can't catch on its own,
 * without needing a database-level unique constraint that would also have to reject legitimate
 * manually-entered roles with no source_reference at all. */
export async function insertContactRole(input: {
  contactId: string;
  residentId: string;
  roleType: string;
  status: "claimed" | "verified" | "revoked";
  source: "assessment" | "manual" | "document" | "axiscare" | "other";
  sourceReference: string | null;
  createdBy: string;
}): Promise<void> {
  const supabase = createServerClient();
  if (input.sourceReference) {
    const { data: existing, error: lookupError } = await supabase
      .from("contact_roles")
      .select("id")
      .eq("resident_id", input.residentId)
      .eq("source_reference", input.sourceReference)
      .eq("role_type", input.roleType)
      .maybeSingle();
    if (lookupError) {
      console.error("[insertContactRole:lookup]", { residentId: input.residentId, message: lookupError.message });
    }
    if (existing) return;
  }
  const { error } = await supabase.from("contact_roles").insert([
    {
      contact_id: input.contactId,
      resident_id: input.residentId,
      role_type: input.roleType,
      status: input.status,
      source: input.source,
      source_reference: input.sourceReference,
      created_by: input.createdBy,
    },
  ]);
  if (error) {
    console.error("[insertContactRole]", { residentId: input.residentId, roleType: input.roleType, message: error.message });
  }
}

/** Every contact in the system, in the narrow shape lib/contacts/importantPeopleLinking.ts needs
 * for matching. v0.1 simplicity: a full, unfiltered scan — this table starts empty and is not
 * expected to reach a size where this is a real cost for some time. Revisit (e.g. narrow by a
 * cheap pre-filter on normalized phone/email) if/when it does. Never used to decide anything by
 * itself; classifyContactMatch()'s own never-fuzzy rules are what actually gate any action. */
export async function getAllContactsForMatching(): Promise<
  { contactId: string; firstName: string | null; lastName: string | null; normalizedEmail: string | null; normalizedPhone: string | null }[]
> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("contacts").select("id, first_name, last_name, normalized_email, normalized_phone");
  if (error) {
    console.error("[getAllContactsForMatching]", { message: error.message });
    return [];
  }
  return (
    (data as { id: string; first_name: string | null; last_name: string | null; normalized_email: string | null; normalized_phone: string | null }[] | null) ?? []
  ).map((c) => ({
    contactId: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    normalizedEmail: c.normalized_email,
    normalizedPhone: c.normalized_phone,
  }));
}

/** Every contact id ever suppressed against the given contact — read-only in this slice. No UI
 * in Slice C.3 writes a new suppression (that belongs to the fuller ambiguous-match
 * reconciliation flow, deliberately deferred — see lib/actions/importantPeople.ts's own
 * comment), but the read path already respects any suppression a future/manual entry creates. */
export async function getSuppressedContactIdsFor(contactId: string): Promise<Set<string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("contact_identity_suppressions")
    .select("contact_id_a, contact_id_b")
    .or(`contact_id_a.eq.${contactId},contact_id_b.eq.${contactId}`);
  if (error) {
    console.error("[getSuppressedContactIdsFor]", { contactId, message: error.message });
    return new Set();
  }
  const rows = (data as { contact_id_a: string; contact_id_b: string }[] | null) ?? [];
  const suppressed = new Set<string>();
  for (const row of rows) {
    suppressed.add(row.contact_id_a === contactId ? row.contact_id_b : row.contact_id_a);
  }
  return suppressed;
}
