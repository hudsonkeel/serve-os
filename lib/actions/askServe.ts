"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canViewAskServe } from "@/lib/navigation/permissions";
import { retrieveKnowledgeEvidence } from "@/lib/askServe/retrieval";
import {
  synthesizeAskServeAnswer,
  AskServeSynthesisProviderError,
  AskServeSynthesisValidationError,
} from "@/lib/askServe/answer/synthesize";
import { validateAskServeQuestion, looksClientSpecific } from "@/lib/askServe/answer/inputValidation";
import { CLIENT_SPECIFIC_NOT_FOUND_ANSWER, type AskServeAnswer } from "@/lib/askServe/answer/types";

// The real authorization/validation enforcement for Ask Serve — the
// /ask-serve page already gates on canViewAskServe() for rendering, but
// (matching this codebase's established convention — see
// lib/actions/assessmentCapture.ts) hiding UI is not authorization; this
// server action is what actually enforces it. The auth check runs first,
// before any input validation, retrieval, or model call — see
// lib/actions/__tests__/askServeAuthorization.test.ts, which proves that
// ordering by source inspection (getCurrentAuthorizedUser() reads
// next/headers and cannot be exercised behaviorally in this codebase's
// plain-node test harness).

export interface AskServeQuestionResult {
  answer?: AskServeAnswer;
  error?: string;
}

export async function askServeQuestion(rawQuestion: string): Promise<AskServeQuestionResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to use Ask Serve." };
  }
  if (!canViewAskServe(profile.role)) {
    return { error: "You do not have permission to use Ask Serve." };
  }

  const validated = validateAskServeQuestion(rawQuestion);
  if (!validated.ok) {
    return { error: validated.error };
  }
  const question = validated.question;

  if (looksClientSpecific(question)) {
    return { answer: CLIENT_SPECIFIC_NOT_FOUND_ANSWER };
  }

  const evidence = await retrieveKnowledgeEvidence(question, { limit: 10 });

  try {
    const answer = await synthesizeAskServeAnswer(question, evidence);
    return { answer };
  } catch (err) {
    if (err instanceof AskServeSynthesisProviderError) {
      return { error: "Ask Serve couldn't reach its answer service. Please try again in a moment." };
    }
    if (err instanceof AskServeSynthesisValidationError) {
      return { error: "Ask Serve couldn't produce a reliably grounded answer for this question. Please try rephrasing, or try again." };
    }
    console.error("[askServeQuestion] unexpected failure", { message: err instanceof Error ? err.message : err });
    return { error: "Something went wrong answering this question. Please try again." };
  }
}
