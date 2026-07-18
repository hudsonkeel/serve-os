// Canonical Intake Service — Scope J (Production Intake Unification). See
// docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md for the full wire
// contract this function implements.
//
// This is the ONE public entry point every intake source — the website,
// Serve OS's own /get-started, and any future source (phone, AI voice,
// hospital APIs, partner portals, staff entry, mobile) — is meant to call.
// It deliberately does nothing beyond: validate shape, check idempotency,
// insert one immutable row. No classification, no other table access — the
// Serve Intake Intelligence Engine (serve-os, lib/intake/*.ts) remains the
// single place intake decisions are made, triggered separately by a
// Database Webhook (fast path) and a scheduled reconciliation sweep
// (backstop) — both live in serve-os, both react to the row this function
// creates, neither is called directly from here.
//
// Security: this function holds the Supabase service-role key as a
// Function secret (set via `supabase secrets set`, never committed to any
// repo, never sent to a browser). It is the ONLY caller of
// accept_intake_submission() — that RPC is revoked from public/anon/
// authenticated and granted to service_role only, so there is no direct
// PostgREST path that bypasses this function's own validation.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPPORTED_INTAKE_TYPES = new Set([
  "family_care_inquiry",
  "professional_referral",
  "employment_interest",
  "outside_service_area",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CanonicalIntakePayload {
  source?: unknown;
  sourceSubmissionId?: unknown;
  intakeType?: unknown;
  contactName?: unknown;
  contactPhone?: unknown;
  contactEmail?: unknown;
  zip?: unknown;
  community?: unknown;
  city?: unknown;
  outsideServiceArea?: unknown;
  // The original, source-specific field payload, preserved verbatim — this
  // is what lib/intake/envelope.ts's normalizeIntakeSubmission() actually
  // parses (care-for, message, support_type, organization, role_interest,
  // bot-field, etc.), so callers must send their raw form fields here
  // unmodified, not remapped into this contract's own field names.
  formPayload?: unknown;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Validates the minimum shape needed to safely persist a row — NOT
// Contact-Ready determination (that's the engine's job, downstream, per
// the same rule the Serve Intake Intelligence Engine already applies: a
// submission with no contact name and no phone/email is still preserved as
// evidence, just classified not_actionable by the engine, never rejected
// at the door here).
function validatePayload(payload: CanonicalIntakePayload): string | null {
  const intakeType = readNonEmptyString(payload.intakeType);
  if (!intakeType) return "intakeType is required.";
  if (!SUPPORTED_INTAKE_TYPES.has(intakeType)) {
    return `intakeType "${intakeType}" is not a supported value.`;
  }
  const source = readNonEmptyString(payload.source);
  if (!source) return "source is required.";
  if (payload.formPayload !== undefined && payload.formPayload !== null && typeof payload.formPayload !== "object") {
    return "formPayload must be an object when present.";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  let payload: CanonicalIntakePayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Malformed JSON body." });
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return jsonResponse(400, { error: validationError });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[intake-submit] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY function secret");
    return jsonResponse(500, { error: "Intake service is not configured. Please try again shortly." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.rpc("accept_intake_submission", {
    p_client_submission_id: readNonEmptyString(payload.sourceSubmissionId),
    p_intake_type: readNonEmptyString(payload.intakeType),
    p_source: readNonEmptyString(payload.source),
    p_name: readNonEmptyString(payload.contactName),
    p_phone: readNonEmptyString(payload.contactPhone),
    p_email: readNonEmptyString(payload.contactEmail),
    p_zip: readNonEmptyString(payload.zip),
    p_community: readNonEmptyString(payload.community),
    p_city: readNonEmptyString(payload.city),
    p_outside_service_area: payload.outsideServiceArea === true,
    p_form_payload: payload.formPayload ?? {},
  });

  if (error) {
    // Never surface raw database error detail to a public caller.
    console.error("[intake-submit] accept_intake_submission failed", { message: error.message, code: error.code });
    return jsonResponse(502, { error: "Could not record submission. Please try again shortly." });
  }

  return jsonResponse(201, { submissionId: data.id });
});
