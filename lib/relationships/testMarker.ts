// Deterministic test-marker generation for live-database verification —
// see docs/engineering/TEST_DATA_HYGIENE.md. Pure string formatting, no
// DB/React dependency, so the naming convention itself is unit-tested
// independent of any script that calls it.
//
// Format: __SERVE_TEST__ <purpose> <run-id>
// Example: __SERVE_TEST__ operational-whiteboard 20260716T143200Z-a81f

export const PREFIX = "__SERVE_TEST__";

function formatTimestamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function generateTestMarker(
  purpose: string,
  now: Date = new Date(),
  randomSuffix: string = Math.random().toString(16).slice(2, 6)
): string {
  const trimmedPurpose = purpose.trim();
  if (!trimmedPurpose) {
    throw new Error("generateTestMarker requires a non-blank purpose");
  }
  return `${PREFIX} ${trimmedPurpose} ${formatTimestamp(now)}-${randomSuffix}`;
}

export function isTestMarker(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}
