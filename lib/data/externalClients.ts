import { createServerClient } from "@/lib/supabase/server";
import { ExternalClient, RelationshipActionType } from "@/lib/supabase/types";
import { getRelationshipBoardRows, RelationshipBoardRow } from "@/lib/data/relationships";
import { getRelationshipAttentionStatus } from "@/lib/relationships/attention";
import { ExternalClientWorkspaceRow, isExternalWorkspaceRow } from "@/lib/externalClients/search";

// ─── Reads ─────────────────────────────────────────────────────────────

// Bulk map, one row per Relationship that has a linked external_clients
// record — never one query per relationship.
export async function getExternalClientsByRelationship(): Promise<
  Map<string, ExternalClient>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("external_clients").select("*");

  if (error) {
    console.error("[externalClients:getExternalClientsByRelationship:error]", {
      message: error.message,
      code: error.code,
    });
    return new Map();
  }

  const result = new Map<string, ExternalClient>();
  for (const row of (data as ExternalClient[] | null) ?? []) {
    result.set(row.relationship_id, row);
  }
  return result;
}

export async function getExternalClientByRelationshipId(
  relationshipId: string
): Promise<ExternalClient | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("external_clients")
    .select("*")
    .eq("relationship_id", relationshipId)
    .maybeSingle<ExternalClient>();

  if (error) {
    console.error("[externalClients:getExternalClientByRelationshipId:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return data;
}

// The External Clients workspace's full row set — reuses
// getRelationshipBoardRows() (already merges nearest action, active note,
// service opportunity) rather than forking a second CRM query path (Part
// 6: "Reuse existing Relationship... filters... sorting"), then narrows to
// external prospects and external active/on-hold/former clients and merges
// in each row's external_clients fields where present.
export async function getExternalClientWorkspaceRows(): Promise<ExternalClientWorkspaceRow[]> {
  const [boardRows, externalClients] = await Promise.all([
    getRelationshipBoardRows(),
    getExternalClientsByRelationship(),
  ]);

  return boardRows
    .filter((row: RelationshipBoardRow) => isExternalWorkspaceRow(row))
    .map((row) => {
      const client = externalClients.get(row.id) ?? null;
      const nearestOpenActionDueAt = row.nearestAction ? row.nearestAction.dueAt : undefined;

      return {
        ...row,
        nearestActionTitle: row.nearestAction?.title ?? null,
        nearestActionDueAt: nearestOpenActionDueAt ?? null,
        attentionStatus: getRelationshipAttentionStatus({
          status: row.status,
          relationshipType: row.relationshipType,
          nearestOpenActionDueAt,
        }),
        externalClientId: client?.id ?? null,
        externalClientStatus: client?.status ?? null,
        city: client?.city ?? null,
        serviceStartDate: client?.service_start_date ?? null,
      };
    });
}

// ─── Writes (all via atomic RPCs — see
// supabase/migrations/20260719000000_create_external_clients_and_conversions.sql) ──

export interface ConvertExternalProspectToActiveClientInput {
  relationshipId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  phone: string | null;
  email: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  primaryContactName: string | null;
  primaryContactRelationship: string | null;
  primaryContactPhone: string | null;
  primaryContactEmail: string | null;
  serviceStartDate: string | null;
  conversionNote: string | null;
  openActionDisposition: string;
  onboardingActionTitle: string | null;
  onboardingActionType: RelationshipActionType | null;
  onboardingActionDueAt: string | null;
  actor: string;
}

export async function convertExternalProspectToActiveClient(
  input: ConvertExternalProspectToActiveClientInput
): Promise<{ externalClientId?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("convert_external_prospect_to_active_client", {
    p_relationship_id: input.relationshipId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_preferred_name: input.preferredName,
    p_phone: input.phone,
    p_email: input.email,
    p_service_address_line_1: input.serviceAddressLine1,
    p_service_address_line_2: input.serviceAddressLine2,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postalCode,
    p_primary_contact_name: input.primaryContactName,
    p_primary_contact_relationship: input.primaryContactRelationship,
    p_primary_contact_phone: input.primaryContactPhone,
    p_primary_contact_email: input.primaryContactEmail,
    p_service_start_date: input.serviceStartDate,
    p_conversion_note: input.conversionNote,
    p_open_action_disposition: input.openActionDisposition,
    p_onboarding_action_title: input.onboardingActionTitle,
    p_onboarding_action_type: input.onboardingActionType,
    p_onboarding_action_due_at: input.onboardingActionDueAt,
    p_actor: input.actor,
  });

  if (error) {
    if (error.message?.includes("RELATIONSHIP_NOT_ELIGIBLE")) {
      return { error: "This relationship is no longer an open External Prospect." };
    }
    console.error("[externalClients:convertExternalProspectToActiveClient:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not activate this external client." };
  }

  return { externalClientId: data as string };
}

export interface ConvertExternalProspectToNewResidentInput {
  relationshipId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  communityName: string | null;
  unitNumber: string | null;
  phone: string | null;
  email: string | null;
  familyContactName: string | null;
  familyContactRelationship: string | null;
  familyContactPhone: string | null;
  familyContactEmail: string | null;
  conversionNote: string | null;
  actor: string;
}

export async function convertExternalProspectToNewResident(
  input: ConvertExternalProspectToNewResidentInput
): Promise<{ residentId?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("convert_external_prospect_to_new_resident", {
    p_relationship_id: input.relationshipId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_preferred_name: input.preferredName,
    p_community_name: input.communityName,
    p_unit_number: input.unitNumber,
    p_phone: input.phone,
    p_email: input.email,
    p_family_contact_name: input.familyContactName,
    p_family_contact_relationship: input.familyContactRelationship,
    p_family_contact_phone: input.familyContactPhone,
    p_family_contact_email: input.familyContactEmail,
    p_conversion_note: input.conversionNote,
    p_actor: input.actor,
  });

  if (error) {
    if (error.message?.includes("RELATIONSHIP_NOT_ELIGIBLE")) {
      return { error: "This relationship is no longer an open External Prospect." };
    }
    console.error("[externalClients:convertExternalProspectToNewResident:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not create a resident for this prospect." };
  }

  return { residentId: data as string };
}

export async function convertExternalProspectToExistingResident(
  relationshipId: string,
  residentId: string,
  conversionNote: string | null,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("convert_external_prospect_to_existing_resident", {
    p_relationship_id: relationshipId,
    p_resident_id: residentId,
    p_conversion_note: conversionNote,
    p_actor: actor,
  });

  if (error) {
    if (error.message?.includes("RELATIONSHIP_NOT_ELIGIBLE")) {
      return { error: "This relationship is no longer an open External Prospect." };
    }
    console.error("[externalClients:convertExternalProspectToExistingResident:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not link this prospect to a resident." };
  }

  return {};
}

export interface ConvertResidentProspectToActiveClientInput {
  relationshipId: string;
  effectiveStartDate: string | null;
  conversionNote: string | null;
  openActionDisposition: string;
  onboardingActionTitle: string | null;
  onboardingActionType: RelationshipActionType | null;
  onboardingActionDueAt: string | null;
  actor: string;
}

export async function convertResidentProspectToActiveClient(
  input: ConvertResidentProspectToActiveClientInput
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("convert_resident_prospect_to_active_client", {
    p_relationship_id: input.relationshipId,
    p_effective_start_date: input.effectiveStartDate,
    p_conversion_note: input.conversionNote,
    p_open_action_disposition: input.openActionDisposition,
    p_onboarding_action_title: input.onboardingActionTitle,
    p_onboarding_action_type: input.onboardingActionType,
    p_onboarding_action_due_at: input.onboardingActionDueAt,
    p_actor: input.actor,
  });

  if (error) {
    if (error.message?.includes("RELATIONSHIP_NOT_ELIGIBLE")) {
      return { error: "This relationship is no longer an open Resident Prospect." };
    }
    console.error("[externalClients:convertResidentProspectToActiveClient:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not convert this relationship to an Active Client." };
  }

  return {};
}

export async function placeExternalClientOnHold(
  relationshipId: string,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("place_external_client_on_hold", {
    p_relationship_id: relationshipId,
    p_actor: actor,
  });

  if (error) {
    console.error("[externalClients:placeExternalClientOnHold:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not place this client on hold." };
  }

  return {};
}

export async function reactivateExternalClient(
  relationshipId: string,
  nextActionTitle: string | null,
  nextActionType: RelationshipActionType | null,
  nextActionDueAt: string | null,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("reactivate_external_client", {
    p_relationship_id: relationshipId,
    p_next_action_title: nextActionTitle,
    p_next_action_type: nextActionType,
    p_next_action_due_at: nextActionDueAt,
    p_actor: actor,
  });

  if (error) {
    console.error("[externalClients:reactivateExternalClient:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not reactivate this client." };
  }

  return {};
}

export async function markExternalClientFormer(
  relationshipId: string,
  effectiveEndDate: string | null,
  reason: string | null,
  openActionDisposition: string,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("mark_external_client_former", {
    p_relationship_id: relationshipId,
    p_effective_end_date: effectiveEndDate,
    p_reason: reason,
    p_open_action_disposition: openActionDisposition,
    p_actor: actor,
  });

  if (error) {
    console.error("[externalClients:markExternalClientFormer:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not mark this client as former." };
  }

  return {};
}
