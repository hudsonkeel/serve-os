"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";

// Entry point into the Serve Intake Engine's voice/mobile capture experience — distinct
// from lib/actions/intakeEngine.ts (the website-form Intake Intelligence Engine; see
// docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md). This is the "Capture Assessment" action
// from an existing canonical Serve person's profile, per serve-intake-mvp's
// docs/architecture/phase3-mobile-person-first-architecture.md §2 (2026-08-10 revision):
// mints a single-use, opaque handoff code via the create_intake_handoff_code() RPC
// (serve-intake-mvp's supabase/... migration, applied to this same Supabase project) and
// returns a capture URL carrying only that opaque code — never resident identity or actor
// claims in the URL itself.

export interface StartAssessmentCaptureResult {
  captureUrl?: string;
  error?: string;
}

export async function startAssessmentCapture(
  residentId: string
): Promise<StartAssessmentCaptureResult> {
  if (!residentId) {
    return { error: "Missing resident." };
  }

  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to start an assessment." };
  }

  const intakeBaseUrl = process.env.NEXT_PUBLIC_SERVE_INTAKE_URL;
  if (!intakeBaseUrl) {
    return { error: "Serve Intake is not configured (NEXT_PUBLIC_SERVE_INTAKE_URL is unset)." };
  }

  const actor = profile.full_name || profile.email;
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("create_intake_handoff_code", {
    p_resident_id: residentId,
    p_actor: actor,
  });

  if (error) {
    return { error: `Could not start assessment capture: ${error.message}` };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const code = row?.code as string | undefined;

  if (!code) {
    return { error: "Could not start assessment capture: no handoff code returned." };
  }

  const captureUrl = new URL("/capture", intakeBaseUrl);
  captureUrl.searchParams.set("code", code);

  return { captureUrl: captureUrl.toString() };
}
