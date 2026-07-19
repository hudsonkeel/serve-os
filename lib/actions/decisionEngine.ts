"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { evaluateDecision, reevaluateWithNewEvidence } from "@/lib/intelligence/decisionEngine/evaluate.ts";
import type { EvaluateDecisionResult } from "@/lib/intelligence/decisionEngine/evaluate.ts";
import type { DecisionType } from "@/lib/intelligence/decisionEngine/registry.ts";

// The authenticated UI entry point ONLY. Contains no decision logic the
// shared service (lib/intelligence/decisionEngine/evaluate.ts) doesn't
// already have — this file's only job is the auth check. The seed and
// live-verification scripts call the shared service directly instead of
// this file, because getCurrentAuthorizedUser() depends on next/headers'
// cookies(), which throws outside a real request context.

export async function evaluateDecisionAction<TInput>(
  decisionType: DecisionType,
  input: TInput,
): Promise<EvaluateDecisionResult> {
  const actor = await getCurrentAuthorizedUser();
  if (!actor) {
    return { error: "Not authorized." };
  }
  return evaluateDecision(decisionType, input, { notify: true });
}

export async function reevaluateDecisionWithNewEvidenceAction<TInput>(
  decisionType: DecisionType,
  input: TInput,
): Promise<EvaluateDecisionResult> {
  const actor = await getCurrentAuthorizedUser();
  if (!actor) {
    return { error: "Not authorized." };
  }
  return reevaluateWithNewEvidence(decisionType, input, { notify: true });
}
