"use server";

import {
  captureDraftContact as captureDraftContactData,
  completeConversationSession as completeConversationSessionData,
  createConversationSession,
  recordConversationEvent as recordConversationEventData,
  touchConversationSession,
} from "@/lib/data/conversationSessions";
import { deriveContactCaptureStatus } from "@/lib/intake/conversationConsent";
import type { ConversationEventType } from "@/lib/supabase/types";

// Conversation telemetry + the Canonical Intake Service call — Scope J
// (Production Intake Unification). These are the ONLY intake-related
// server actions `/get-started`'s two wizards (ServeIntakeFlow,
// RecruitingPanel) call — see docs/integrations/
// WEBSITE_TO_SERVE_INTAKE_CONTRACT.md for the full model. Product-
// experience telemetry (this file's first half) never creates a
// Relationship, Recruiting Lead, Timeline event, or intake_processing_records
// row; only submitCanonicalIntake() (the second half) does, and even that
// indirectly — it calls the same Supabase Edge Function every other intake
// source calls, never writing to `intake_submissions` (or any operational
// table) directly from Serve OS itself.

export async function startConversationSession(input: {
  sessionKey: string;
  experienceType: string;
  source: string;
  channelVersion: string;
}): Promise<{ id: string } | null> {
  const session = await createConversationSession(input);
  if (!session) return null;
  await recordConversationEventData(session.id, "conversation_started");
  return { id: session.id };
}

export async function recordConversationEvent(
  sessionId: string,
  eventType: ConversationEventType,
  detail?: { stepKey?: string; stepSequence?: number; metadata?: Record<string, unknown> }
): Promise<void> {
  await recordConversationEventData(sessionId, eventType, detail);
  if (eventType === "step_completed" && detail?.stepKey) {
    await touchConversationSession(sessionId, detail.stepKey);
  }
}

// Derives contact_capture_status from the caller's raw inputs (never
// trusts a pre-derived status from the client) — the one place this
// scope's consent boundary is enforced. See lib/intake/conversationConsent.ts.
export async function captureDraftContact(
  sessionId: string,
  input: {
    name: string | null;
    phone: string | null;
    email: string | null;
    consentGiven: boolean;
    inquirySummary?: string | null;
  }
): Promise<void> {
  const hasContactName = !!input.name?.trim();
  const hasContactMethod = !!(input.phone?.trim() || input.email?.trim());
  const status = deriveContactCaptureStatus({ hasContactName, hasContactMethod, consentGiven: input.consentGiven });

  await captureDraftContactData(sessionId, {
    contactCaptureStatus: status,
    contactName: input.name,
    contactPhone: input.phone,
    contactEmail: input.email,
    inquirySummary: input.inquirySummary ?? null,
  });
}

export interface CanonicalIntakeSubmitInput {
  source: string;
  intakeType: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  zip?: string | null;
  community?: string | null;
  city?: string | null;
  outsideServiceArea?: boolean;
  // The submitter's raw, source-specific fields, preserved verbatim — this
  // is what lib/intake/envelope.ts's normalizeIntakeSubmission() parses
  // (care-for, message, support_type, organization, role_interest,
  // bot-field, etc.). Never remapped into this input's own field names.
  formPayload: Record<string, unknown>;
  sourceSubmissionId?: string;
}

// The one call every intake source makes to actually create a Canonical
// Intake Submission — an HTTPS call to the `intake-submit` Supabase Edge
// Function, exactly like serve-website's Netlify Functions make. Serve OS
// never writes to `intake_submissions` directly, even from its own
// `/get-started` — no privileged bypass, per the architecture decision.
export async function submitCanonicalIntake(
  input: CanonicalIntakeSubmitInput,
  conversationSessionId?: string | null
): Promise<{ submissionId?: string; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("[conversationTelemetry:submitCanonicalIntake:error] missing Supabase URL/anon key env vars");
    return { error: "Something went wrong. Please try again or call Serve Caregiving." };
  }

  if (conversationSessionId) {
    await recordConversationEventData(conversationSessionId, "submission_attempted");
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/intake-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        source: input.source,
        sourceSubmissionId: input.sourceSubmissionId,
        intakeType: input.intakeType,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        zip: input.zip ?? null,
        community: input.community ?? null,
        city: input.city ?? null,
        outsideServiceArea: input.outsideServiceArea ?? false,
        formPayload: input.formPayload,
      }),
    });

    const body = (await response.json()) as { submissionId?: string; error?: string };

    if (!response.ok || !body.submissionId) {
      if (conversationSessionId) {
        await recordConversationEventData(conversationSessionId, "submission_failed");
      }
      return { error: body.error ?? "Something went wrong. Please try again or call Serve Caregiving." };
    }

    if (conversationSessionId) {
      await recordConversationEventData(conversationSessionId, "submission_succeeded");
      await completeConversationSessionData(conversationSessionId, body.submissionId);
    }

    return { submissionId: body.submissionId };
  } catch (err) {
    if (conversationSessionId) {
      await recordConversationEventData(conversationSessionId, "submission_failed");
    }
    console.error("[conversationTelemetry:submitCanonicalIntake:error]", err);
    return { error: "Something went wrong. Please try again or call Serve Caregiving." };
  }
}
