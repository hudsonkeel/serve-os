"use server";

// Closed-Loop UX Pass, Phase 1 — resolving an individual AxisCare
// canonical-field conflict (Reconciliation). Same governance boundary as
// every other reconciliation decision (admin/manager/executive). Every
// write here goes through the SAME governed resident-column update
// functions the resident profile's own edit forms already use
// (lib/data/residents.ts) — this file adds zero new resident-mutation
// mechanism, only a field-scoped merge-and-write wrapper around them plus
// the field_decisions bookkeeping that keeps a reviewed conflict from
// re-alerting on the next AxisCare sync (see
// computeUnresolvedFieldConflicts, lib/integrations/axiscare/clientCanonicalReconciliation.ts).
import { revalidatePath } from "next/cache";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { createServerClient } from "@/lib/supabase/server";
import {
  getAxisCareClientCanonicalSnapshot,
  recordFieldDecision,
} from "@/lib/data/axiscareClientCanonicalSnapshot";
import { updateFamilyContactFields, updateResidentProfileFields } from "@/lib/data/residents";
import { logResidentProfileUpdated } from "@/lib/data/residentTimeline";
import { combinedAddress, type BootstrapFieldName } from "@/lib/integrations/axiscare/clientCanonicalReconciliation";

type ConflictActionResult = { error?: string; success?: boolean };

async function requireConflictActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to resolve AxisCare data conflicts." };
  }
  return { actor: profile.full_name?.trim() || profile.email };
}

function revalidateConflictSurfaces(residentId: string) {
  revalidatePath("/reconciliation");
  revalidatePath("/clients");
  revalidatePath("/residents");
  revalidatePath(`/residents/${residentId}`);
}

// Re-derives the field's AxisCare-observed value server-side from the
// authoritative snapshot row rather than trusting a client-supplied
// value — what gets written into a resident column, and what
// axiscare_value_at_decision is recorded against, must be traceable to
// the same source record every time.
function axiscareValueForField(
  snapshot: NonNullable<Awaited<ReturnType<typeof getAxisCareClientCanonicalSnapshot>>>,
  field: BootstrapFieldName
): string | null {
  switch (field) {
    case "date_of_birth":
      return snapshot.date_of_birth;
    case "gender":
      return snapshot.gender;
    case "date_of_admission":
      return snapshot.admission_date;
    case "address":
      return combinedAddress(snapshot.street_address_1, snapshot.street_address_2);
    case "city":
      return snapshot.city;
    case "state":
      return snapshot.state;
    case "zip_code":
      return snapshot.postal_code;
    case "family_contact_name":
      return snapshot.responsible_party_name;
    case "family_contact_relationship":
      return snapshot.responsible_party_relationship;
    case "family_contact_phone":
      return snapshot.responsible_party_phone;
    case "family_contact_email":
      return snapshot.responsible_party_email;
  }
}

// Human reviewed both values and intentionally determined the canonical
// Serve value remains correct. Writes nothing to the resident — only
// records the decision, keyed to the AxisCare value reviewed, so the
// same unchanged observation stops re-alerting on future syncs while a
// genuinely new disagreement still will (see recordFieldDecision).
export async function keepServeConflictValue(
  snapshotId: string,
  residentId: string,
  field: BootstrapFieldName
): Promise<ConflictActionResult> {
  const actorResult = await requireConflictActor();
  if ("error" in actorResult) return actorResult;

  const snapshot = await getAxisCareClientCanonicalSnapshot((await getSnapshotAxisCareId(snapshotId)) ?? "");
  if (!snapshot) return { error: "Could not find this AxisCare conflict record." };

  const result = await recordFieldDecision(snapshotId, field, "keep_serve", axiscareValueForField(snapshot, field), actorResult.actor);
  if (result.error) return { error: result.error };

  revalidateConflictSurfaces(residentId);
  return { success: true };
}

// Human reviewed both values and intentionally adopts the AxisCare value
// into the canonical Serve record. Reuses the exact governed write each
// field's own resident-profile edit form already uses — never a direct
// mutation from this reconciliation surface. Fields with no existing
// governed write path are refused outright rather than writing around
// one (see the default case below).
export async function adoptAxisCareConflictValue(
  snapshotId: string,
  residentId: string,
  field: BootstrapFieldName
): Promise<ConflictActionResult> {
  const actorResult = await requireConflictActor();
  if ("error" in actorResult) return actorResult;

  const snapshot = await getAxisCareClientCanonicalSnapshot((await getSnapshotAxisCareId(snapshotId)) ?? "");
  if (!snapshot) return { error: "Could not find this AxisCare conflict record." };

  const axiscareValue = axiscareValueForField(snapshot, field);
  const supabase = createServerClient();

  if (field === "family_contact_name" || field === "family_contact_relationship" || field === "family_contact_phone" || field === "family_contact_email") {
    const { data: resident, error: readError } = await supabase
      .from("residents")
      .select("family_contact_name, family_contact_relationship, family_contact_phone, family_contact_email")
      .eq("id", residentId)
      .maybeSingle();
    if (readError || !resident) return { error: readError?.message ?? "Resident not found." };

    const writeResult = await updateFamilyContactFields(residentId, {
      family_contact_name: field === "family_contact_name" ? axiscareValue : resident.family_contact_name,
      family_contact_relationship: field === "family_contact_relationship" ? axiscareValue : resident.family_contact_relationship,
      family_contact_phone: field === "family_contact_phone" ? axiscareValue : resident.family_contact_phone,
      family_contact_email: field === "family_contact_email" ? axiscareValue : resident.family_contact_email,
    });
    if (writeResult.error) return { error: writeResult.error };
  } else if (field === "date_of_birth" || field === "date_of_admission") {
    const { data: resident, error: readError } = await supabase
      .from("residents")
      .select("email, phone, date_of_birth, date_of_admission, preferred_language, mobility")
      .eq("id", residentId)
      .maybeSingle();
    if (readError || !resident) return { error: readError?.message ?? "Resident not found." };

    const writeResult = await updateResidentProfileFields(residentId, {
      email: resident.email,
      phone: resident.phone,
      date_of_birth: field === "date_of_birth" ? axiscareValue : resident.date_of_birth,
      date_of_admission: field === "date_of_admission" ? axiscareValue : resident.date_of_admission,
      preferred_language: resident.preferred_language,
      mobility: resident.mobility,
    });
    if (writeResult.error) return { error: writeResult.error };
  } else {
    // gender, address, city, state, zip_code — no existing governed
    // resident-column write path today (verified: neither
    // updateResidentProfileFields nor updateFamilyContactFields nor
    // updateCareContactFields covers them, and no other resident edit
    // surface does either). Per standing instruction: STOP this specific
    // action rather than writing directly into residents from here.
    return {
      error:
        "There is no existing governed edit path for this field yet, so it can't be adopted from AxisCare here. Keep Serve is still available, or resolve this field directly once a governed edit path exists.",
    };
  }

  const decisionResult = await recordFieldDecision(snapshotId, field, "use_axiscare", axiscareValue, actorResult.actor);
  if (decisionResult.error) return { error: decisionResult.error };

  await logResidentProfileUpdated(residentId, actorResult.actor, "AxisCare conflict resolution");

  revalidateConflictSurfaces(residentId);
  return { success: true };
}

// axiscare_client_canonical_snapshot's primary key (snapshotId) and its
// natural key (axiscare_client_id) are different columns — the read
// helpers this file needs (getAxisCareClientCanonicalSnapshot) are keyed
// by the latter. This resolves id -> axiscare_client_id once so callers
// above only ever have to pass the id they already have (the same id the
// Reconciliation UI already renders per conflict row).
async function getSnapshotAxisCareId(snapshotId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from("axiscare_client_canonical_snapshot").select("axiscare_client_id").eq("id", snapshotId).maybeSingle();
  return data?.axiscare_client_id ?? null;
}
