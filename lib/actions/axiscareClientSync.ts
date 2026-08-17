"use server";

// AxisCare Client Data Sync — manual trigger ("Sync Now") and conflict
// resolution. Same governance boundary as every other reconciliation
// action (admin/manager/executive) and reuses the exact same orchestrator
// the scheduled endpoint and the post-Confirm-Match trigger call — no
// separate sync logic here, only the human-triggered entry point.
import { revalidatePath } from "next/cache";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { syncAllConfirmedResidentsCanonical, type BulkSyncSummary } from "@/lib/data/axiscareClientSync";
import { recordSnapshotCanonicalizationResult } from "@/lib/data/axiscareClientCanonicalSnapshot";

async function requireSyncActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to run AxisCare Client Data Sync." };
  }
  return { actor: profile.full_name?.trim() || profile.email };
}

export async function runAxisCareClientDataSyncNow(): Promise<{ error?: string; summary?: BulkSyncSummary }> {
  const actorResult = await requireSyncActor();
  if ("error" in actorResult) return actorResult;

  const summary = await syncAllConfirmedResidentsCanonical(actorResult.actor, "manual");

  revalidatePath("/reconciliation");
  revalidatePath("/clients");
  revalidatePath("/residents");
  revalidatePath("/audit-readiness");

  return { summary };
}

// A conflict is never auto-resolved either direction — this only records
// that a human looked at it. The Serve value keeps governing either way;
// dismissing just clears the review flag using the exact same governed
// write recordSnapshotCanonicalizationResult() already performs for every
// other canonicalization outcome (no new mechanism). To actually CHANGE
// the Serve-owned value, use the resident's own profile edit — this
// action never writes to residents.
export async function dismissAxisCareCanonicalConflict(snapshotId: string, note: string): Promise<{ error?: string }> {
  const actorResult = await requireSyncActor();
  if ("error" in actorResult) return actorResult;
  if (!note.trim()) return { error: "A note is required to dismiss a conflict." };

  const result = await recordSnapshotCanonicalizationResult(snapshotId, {
    status: "skipped_serve_already_owns",
    conflictStatus: null,
    conflictNotes: `Reviewed by ${actorResult.actor}: ${note.trim()}`,
    appliedBy: null,
  });
  if (result.error) return { error: result.error };

  revalidatePath("/reconciliation");
  return {};
}
