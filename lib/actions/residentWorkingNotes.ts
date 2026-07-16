"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  archiveResidentWorkingNote as archiveResidentWorkingNoteRecord,
  createResidentWorkingNote as createResidentWorkingNoteRecord,
  resolveResidentWorkingNote as resolveResidentWorkingNoteRecord,
} from "@/lib/data/residentWorkingNotes";
import {
  normalizeWorkingNoteCategory,
  normalizeWorkingNoteContent,
} from "@/lib/residentWorkingNotes/validation";

export interface CreateWorkingNoteInput {
  residentId: string;
  content: string;
  category: string;
}

export async function createWorkingNote(
  data: CreateWorkingNoteInput
): Promise<{ error?: string }> {
  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  const normalized = normalizeWorkingNoteContent(data.content);
  if (normalized.error || !normalized.content) {
    return { error: normalized.error };
  }

  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to add a working note." };
  }

  const result = await createResidentWorkingNoteRecord({
    residentId: data.residentId,
    content: normalized.content,
    category: normalizeWorkingNoteCategory(data.category),
    actor: profile.full_name || profile.email,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export interface WorkingNoteActionInput {
  workingNoteId: string;
}

export async function resolveWorkingNote(
  data: WorkingNoteActionInput
): Promise<{ error?: string }> {
  if (!data.workingNoteId) {
    return { error: "Missing working note." };
  }

  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to resolve a working note." };
  }

  const result = await resolveResidentWorkingNoteRecord(
    data.workingNoteId,
    profile.full_name || profile.email
  );

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export async function archiveWorkingNote(
  data: WorkingNoteActionInput
): Promise<{ error?: string }> {
  if (!data.workingNoteId) {
    return { error: "Missing working note." };
  }

  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to archive a working note." };
  }

  const result = await archiveResidentWorkingNoteRecord(
    data.workingNoteId,
    profile.full_name || profile.email
  );

  if (result.error) {
    return { error: result.error };
  }

  return {};
}
