// Security hotfix (fix/resident-identity-authorization) — the pure
// authorization decision behind lib/actions/residentIdentity.ts's and
// lib/actions/residentDataIntegrity.ts's requireReconciliationActor()
// helpers, split out so it can be unit-tested directly: the action files
// themselves resolve the caller's profile via getCurrentAuthorizedUser(),
// which reads next/headers cookies and cannot run outside a Next.js
// request context (including this codebase's plain-node test harness).
// This function takes an already-resolved profile and makes the same
// canPerformReconciliationActions(admin/manager/executive) decision
// lib/actions/reconciliation.ts already enforces for the sibling
// /reconciliation workflow — reused here, not re-derived, so all three
// surfaces share one authorization tier that can never drift apart.
import type { AuthRole } from "./constants";
// Real (value) import, not type-only, so it must resolve under plain
// Node ESM when this module is loaded directly by
// lib/auth/__tests__/reconciliationActor.test.ts — hence the explicit
// .ts extension, unlike this file's own consumers in lib/actions/*.ts,
// which are only ever bundled by Next.js and use the @/ alias instead.
import { canPerformReconciliationActions } from "./permissions.ts";

export interface ReconciliationActorProfile {
  role: AuthRole | null | undefined;
  full_name?: string | null;
  email?: string | null;
}

export function resolveReconciliationActor(
  profile: ReconciliationActorProfile | null | undefined
): { actor: string } | { error: string } {
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    return { error: "You are not authorized to make reconciliation decisions." };
  }
  return { actor: profile.full_name?.trim() || profile.email || "" };
}
