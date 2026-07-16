"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { saveResidentCurrentNeeds as saveResidentCurrentNeedsRecord } from "@/lib/data/residentCurrentNeeds";
import { normalizeResidentCurrentNeedsContent } from "@/lib/residentCurrentNeeds/validation";

export interface SaveResidentCurrentNeedsInput {
  residentId: string;
  content: string;
}

// The UI only ever saves source_type "staff_entry" — assessment,
// conversation, document_import, and system are reserved for future
// non-UI writers (see AGENTS.md scope, "Source Attribution").
export async function saveResidentCurrentNeeds(
  data: SaveResidentCurrentNeedsInput
): Promise<{ error?: string }> {
  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  const normalized = normalizeResidentCurrentNeedsContent(data.content);
  if (normalized.error || !normalized.content) {
    return { error: normalized.error };
  }

  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to save current needs." };
  }

  const actor = profile.full_name || profile.email;

  const result = await saveResidentCurrentNeedsRecord({
    residentId: data.residentId,
    content: normalized.content,
    sourceType: "staff_entry",
    sourceLabel: null,
    actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}
