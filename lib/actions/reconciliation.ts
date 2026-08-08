"use server";

// Governed correction actions for the Reconciliation workflow
// (/reconciliation). Reuses the existing, already-in-production
// identity-link and disposition RPC infrastructure — no second identity
// system, no new tables. Every action here requires an authorized actor
// (admin/manager/executive, same boundary as resident profile edits)
// and, for anything that changes durable state, a rationale — enforced
// both here and again at the database layer (the underlying RPCs
// themselves reject a missing actor/rationale).
import { revalidatePath } from "next/cache";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { syncAxisCareClientIdentity } from "@/lib/data/residentAxisCareLinks";
import {
  confirmPersonVendorIdentityLink,
  rejectPersonVendorIdentityLink,
  deferPersonVendorIdentityLink,
} from "@/lib/data/personVendorIdentityLinks";
import { setAxisCareClientDisposition } from "@/lib/data/axiscareClientDispositions";
import { toPersonVendorIdentityLinksMatchMethod, type ClientMatchBasis } from "@/lib/integrations/axiscare/clientIdentityMatching";
import type { AxisCareClientDisposition } from "@/lib/integrations/axiscare/clientDisposition";

type ReconciliationActionResult = { error?: string; success?: boolean };

async function requireReconciliationActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to make reconciliation decisions." };
  }
  return { actor: profile.full_name?.trim() || profile.email };
}

export interface AxisCareIdentityCandidateInput {
  axiscareId: string;
  vendorDisplayName: string;
  matchBasis: ClientMatchBasis;
  residentId: string;
  statusLabel: string | null;
  statusActive: boolean;
  classes: string[];
}

// Every reconciliation identity decision starts here — creates the
// 'proposed' link row if none exists yet (the common case: these are
// fresh, human-reviewed matches the automated sync never wrote,
// precisely because they required review). Idempotent: if a decision
// already exists for this AxisCare record, sync_axiscare_client_identity
// reports back rather than reopening it (see
// scripts/syncAxisCareClientIdentities.ts's own established behavior).
async function ensureProposedLink(input: AxisCareIdentityCandidateInput): Promise<{ linkId: string } | { error: string }> {
  if (input.matchBasis === "none") {
    return { error: "No match basis on file — cannot create an identity link without one." };
  }

  const result = await syncAxisCareClientIdentity({
    vendorRecordId: input.axiscareId,
    vendorDisplayName: input.vendorDisplayName,
    matchMethod: toPersonVendorIdentityLinksMatchMethod(input.matchBasis),
    // Reconciliation-initiated matches are, by definition, the ones that
    // did not clear the fully-deterministic bar the automated sync
    // requires — "medium", not "high".
    matchConfidence: "medium",
    candidateSubjectId: input.residentId,
    approvedSourceData: {
      statusLabel: input.statusLabel,
      statusActive: input.statusActive,
      classes: input.classes,
    },
  });

  if (result.error || !result.linkId) {
    return { error: result.error ?? "Could not create a pending identity link for this record." };
  }
  return { linkId: result.linkId };
}

function revalidatePeopleWeServe() {
  revalidatePath("/reconciliation");
  revalidatePath("/clients");
  revalidatePath("/residents");
}

export async function confirmAxisCareResidentIdentity(
  input: AxisCareIdentityCandidateInput,
  rationale?: string
): Promise<ReconciliationActionResult> {
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const linkResult = await ensureProposedLink(input);
  if ("error" in linkResult) return linkResult;

  const { error } = await confirmPersonVendorIdentityLink({
    linkId: linkResult.linkId,
    subjectId: input.residentId,
    actor: actorResult.actor,
    rationale,
  });
  if (error) return { error };

  revalidatePeopleWeServe();
  return { success: true };
}

export async function rejectAxisCareResidentIdentity(
  input: AxisCareIdentityCandidateInput,
  rationale: string
): Promise<ReconciliationActionResult> {
  if (!rationale.trim()) return { error: "A rationale is required to record that this is not the same person." };
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const linkResult = await ensureProposedLink(input);
  if ("error" in linkResult) return linkResult;

  const { error } = await rejectPersonVendorIdentityLink({ linkId: linkResult.linkId, actor: actorResult.actor, rationale });
  if (error) return { error };

  revalidatePeopleWeServe();
  return { success: true };
}

export async function deferAxisCareResidentIdentity(
  input: AxisCareIdentityCandidateInput,
  rationale: string
): Promise<ReconciliationActionResult> {
  if (!rationale.trim()) return { error: "A rationale is required to defer this decision." };
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const linkResult = await ensureProposedLink(input);
  if ("error" in linkResult) return linkResult;

  const { error } = await deferPersonVendorIdentityLink({ linkId: linkResult.linkId, actor: actorResult.actor, rationale });
  if (error) return { error };

  revalidatePeopleWeServe();
  return { success: true };
}

export interface ClassifyAxisCareClientInput {
  axiscareId: string;
  disposition: AxisCareClientDisposition;
  rationale: string;
  relatedAxisCareClientId?: string | null;
  relatedPersonNote?: string | null;
}

export async function classifyAxisCareClientRecord(input: ClassifyAxisCareClientInput): Promise<ReconciliationActionResult> {
  if (!input.rationale.trim()) return { error: "A rationale is required to classify a vendor record." };
  const actorResult = await requireReconciliationActor();
  if ("error" in actorResult) return actorResult;

  const { error } = await setAxisCareClientDisposition({
    axiscareClientId: input.axiscareId,
    disposition: input.disposition,
    rationale: input.rationale,
    actor: actorResult.actor,
    relatedAxisCareClientId: input.relatedAxisCareClientId,
    relatedPersonNote: input.relatedPersonNote,
  });
  if (error) return { error };

  revalidatePeopleWeServe();
  return { success: true };
}
