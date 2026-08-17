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

// Whole-row "Mark Reviewed" was replaced (Closed-Loop UX Pass, Phase 1) by
// per-field Keep Serve / Use AxisCare decisions
// (lib/actions/axiscareCanonicalConflicts.ts) — a snapshot row can carry
// more than one independently-conflicting field (e.g. Michele Helsley:
// family_contact_name AND family_contact_phone), and a single whole-row
// dismissal used to silently swallow whichever field the operator wasn't
// looking at.
