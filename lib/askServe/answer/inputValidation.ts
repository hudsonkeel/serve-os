// Pure input handling for a submitted Ask Serve question — pulled out of
// lib/actions/askServe.ts so it can be unit-tested directly.
// getCurrentAuthorizedUser() (the actual authorization gate) reads
// next/headers cookies and cannot run outside a real Next.js request, so
// this codebase's established convention (see
// lib/actions/__tests__/residentIdentityAuthorization.test.ts) is to
// unit-test everything that CAN be pure, and prove the auth gate itself
// via source inspection instead — see
// lib/actions/__tests__/askServeAuthorization.test.ts.

export const MAX_QUESTION_LENGTH = 500;
export const MIN_QUESTION_LENGTH = 3;

export type ValidatedQuestion = { ok: true; question: string } | { ok: false; error: string };

export function validateAskServeQuestion(raw: string | null | undefined): ValidatedQuestion {
  const question = (raw ?? "").trim();
  if (question.length < MIN_QUESTION_LENGTH) {
    return { ok: false, error: "Please enter a question." };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: `Questions are limited to ${MAX_QUESTION_LENGTH} characters — please shorten your question.` };
  }
  return { ok: true, question };
}

// A lightweight, deliberately narrow heuristic for "this looks like it's
// asking about one specific resident/client by name," per the explicit
// v0.1 scope boundary — Ask Serve retrieves no resident/client data at
// all, so a question like this would resolve to a generic NOT_FOUND
// regardless; this exists only to give it a clearer, more helpful
// explanation than the generic one. Not a security boundary (retrieval's
// own corpus is the real reason no PHI can ever be returned) and
// deliberately not expanded into a general classifier.
const CLIENT_SPECIFIC_PATTERN = /\b(resident|client)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?('s)?\b/;

export function looksClientSpecific(question: string): boolean {
  return CLIENT_SPECIFIC_PATTERN.test(question);
}
