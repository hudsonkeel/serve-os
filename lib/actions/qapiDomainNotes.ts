"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canManageCorrectiveActions } from "@/lib/compliance/permissions";
import { saveQapiDomainNote as saveQapiDomainNoteRecord } from "@/lib/data/qapiDomainNotes";
import { normalizeQapiDomainNoteContent } from "@/lib/qapi/noteValidation";
import type { QapiDomainId } from "@/lib/supabase/types";

export interface SaveQapiDomainNoteInput {
  domainId: QapiDomainId;
  content: string;
}

// Editing a QAPI domain note reuses corrective-action management
// permission (admin/manager) rather than a new predicate — the same tier
// already gated for consequential Audit Readiness operational writes (see
// lib/compliance/permissions.ts). Reading stays gated by
// canViewAuditReadiness at the page level, unchanged.
export async function saveQapiDomainNote(data: SaveQapiDomainNoteInput): Promise<{ error?: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to save a QAPI domain note." };
  }
  if (!canManageCorrectiveActions(profile.role)) {
    return { error: "You do not have permission to edit QAPI domain notes." };
  }

  const normalized = normalizeQapiDomainNoteContent(data.content);
  if (normalized.error || !normalized.content) {
    return { error: normalized.error };
  }

  const actor = profile.full_name || profile.email;

  const result = await saveQapiDomainNoteRecord({
    domainId: data.domainId,
    content: normalized.content,
    actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}
