import { createServerClient } from "@/lib/supabase/server";
import type {
  ConversationContactCaptureStatus,
  ConversationEventType,
  ConversationSession,
} from "@/lib/supabase/types";

// Data layer for the conversation telemetry layer — Scope J (Production
// Intake Unification). See docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md.
// Product-experience truth only: this file never creates a Relationship,
// Recruiting Lead, Timeline event, or intake_processing_records row — that
// remains the Serve Intake Intelligence Engine's exclusive responsibility,
// triggered only by a real intake_submissions row.

export interface CreateConversationSessionInput {
  sessionKey: string;
  experienceType: string;
  source: string;
  channelVersion: string;
}

export async function createConversationSession(
  input: CreateConversationSessionInput
): Promise<ConversationSession | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("conversation_sessions")
    .insert({
      session_key: input.sessionKey,
      experience_type: input.experienceType,
      source: input.source,
      channel_version: input.channelVersion,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[conversationSessions:createConversationSession:error]", error.message);
    return null;
  }
  return data as ConversationSession;
}

// Every update below keys by `sessionId` (the primary key) rather than
// `session_key` — the client only ever needs one lookup, at
// createConversationSession() time, and holds the returned id in component
// state for the rest of the session's lifetime. `session_key`'s job is
// solely to make that first insert safely retryable (unique constraint),
// not to be a repeated lookup key.

export async function touchConversationSession(
  sessionId: string,
  highestStepReached?: string
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("conversation_sessions")
    .update({
      last_activity_at: new Date().toISOString(),
      ...(highestStepReached ? { highest_step_reached: highestStepReached } : {}),
    })
    .eq("id", sessionId);

  if (error) {
    console.error("[conversationSessions:touchConversationSession:error]", error.message);
  }
}

// Captures/refreshes the partial-recovery draft in place — never a new
// row, never a Relationship/action/note. Only meaningful once the caller
// has already determined the consent boundary (see
// lib/intake/conversationConsent.ts) — this function just persists
// whatever status the caller has already derived.
export async function captureDraftContact(
  sessionId: string,
  input: {
    contactCaptureStatus: ConversationContactCaptureStatus;
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    inquirySummary?: string | null;
  }
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("conversation_sessions")
    .update({
      last_activity_at: new Date().toISOString(),
      contact_capture_status: input.contactCaptureStatus,
      draft_contact_name: input.contactName ?? null,
      draft_contact_phone: input.contactPhone ?? null,
      draft_contact_email: input.contactEmail ?? null,
      draft_inquiry_summary: input.inquirySummary ?? null,
    })
    .eq("id", sessionId);

  if (error) {
    console.error("[conversationSessions:captureDraftContact:error]", error.message);
  }
}

export async function completeConversationSession(
  sessionId: string,
  finalSubmissionId: string
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("conversation_sessions")
    .update({
      completed_at: new Date().toISOString(),
      contact_capture_status: "completed",
      final_submission_id: finalSubmissionId,
    })
    .eq("id", sessionId);

  if (error) {
    console.error("[conversationSessions:completeConversationSession:error]", error.message);
  }
}

export async function recordConversationEvent(
  sessionId: string,
  eventType: ConversationEventType,
  detail?: { stepKey?: string; stepSequence?: number; metadata?: Record<string, unknown> }
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("conversation_events").insert({
    session_id: sessionId,
    event_type: eventType,
    step_key: detail?.stepKey ?? null,
    step_sequence: detail?.stepSequence ?? null,
    metadata: detail?.metadata ?? null,
  });

  if (error) {
    console.error("[conversationSessions:recordConversationEvent:error]", error.message);
  }
}

// Recoverable follow-up work (Part C/item 6 of Scope J's consent
// amendment): abandoned sessions where the person had already consented to
// follow-up before dropping off. No UI reads this yet this scope — data
// layer only, deferred per the plan's explicit boundary.
export async function getRecoverablePartialSessions(
  abandonedForMinutes = 30
): Promise<ConversationSession[]> {
  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - abandonedForMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("conversation_sessions")
    .select("*")
    .eq("contact_capture_status", "consented_for_followup")
    .is("completed_at", null)
    .lt("last_activity_at", cutoff)
    .order("last_activity_at", { ascending: true });

  if (error) {
    console.error("[conversationSessions:getRecoverablePartialSessions:error]", error.message);
    return [];
  }
  return (data as ConversationSession[] | null) ?? [];
}
