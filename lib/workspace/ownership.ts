// Best-effort ownership matching — NOT a real identity system. No
// per-user uuid exists anywhere in this app (see lib/auth/constants.ts /
// lib/auth/display.ts's own precedent); `assigned_to`/`owner_label` are
// free-text fields matched against the current user's email or full name.
// Documented as a limitation in docs/architecture/TODAYS_WORK_CONTINUITY.md,
// not silently worked around.
import type { WorkItem } from "./workItem.ts";

export interface OwnershipIdentity {
  readonly email?: string | null;
  readonly fullName?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function matchesCurrentUser(item: WorkItem, currentUser: OwnershipIdentity): boolean {
  const owner = normalize(item.ownerId ?? item.ownerLabel);
  if (!owner) return false;

  const email = normalize(currentUser.email);
  const fullName = normalize(currentUser.fullName);

  return (email !== "" && owner === email) || (fullName !== "" && owner === fullName);
}

export function isUnassigned(item: WorkItem): boolean {
  return !item.ownerId && !item.ownerLabel;
}
