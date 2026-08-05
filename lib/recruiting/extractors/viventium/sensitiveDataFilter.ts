// Structural safety net for Viventium reconnaissance — see the approved
// plan's explicit exclusion list (SSN, bank account information, tax-form
// contents, birth date, full home address, full document contents,
// unrelated employee records). The generic capture engine
// (dialogReconnaissance.ts's captureDialogStructure) has no knowledge of
// what's sensitive; this is a bounded, pattern-based post-filter applied
// only to the Viventium reconnaissance path, never to Apploi's.
//
// Conservative by design: a false positive (redacting something benign)
// is acceptable; a false negative (leaking something sensitive) is not.
import type { DialogStructuralCapture, StructuralAnchor } from "../apploi/dialogReconnaissance.ts";

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN, dashed
  /\b\d{9}\b/, // SSN or routing number, undashed
  /\b\d{6,17}\b/, // long digit runs — bank account numbers vary 6-17 digits
  /\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/, // a full date (birth date shape) — YYYY-MM-DD or YYYY/MM/DD
  /\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b/, // MM/DD/YYYY or MM-DD-YYYY
  /\b\d{1,5}\s+\S+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct)\b/i, // street address
];

const SENSITIVE_LABEL_HINTS: readonly RegExp[] = [/ssn|social security/i, /birth ?date|date of birth|\bdob\b/i, /routing|account number/i];

export function looksSensitive(text: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(text));
}

function nearestContextLooksSensitive(anchor: StructuralAnchor): boolean {
  const context = `${anchor.nearestHeading ?? ""} ${anchor.nearestLabeledContainer ?? ""}`;
  return SENSITIVE_LABEL_HINTS.some((p) => p.test(context));
}

const REDACTED_PREVIEW = "[redacted — matched a sensitive-data pattern]";

// Redacts (never silently drops — an omitted row is harder to audit than a
// visibly redacted one) any anchor whose preview text, or whose nearest
// heading/labeled-container context, looks sensitive.
export function redactSensitiveAnchors(capture: DialogStructuralCapture): DialogStructuralCapture {
  return {
    ...capture,
    anchors: capture.anchors.map((anchor) => {
      if (looksSensitive(anchor.preview) || nearestContextLooksSensitive(anchor)) {
        return { ...anchor, preview: REDACTED_PREVIEW };
      }
      return anchor;
    }),
  };
}
