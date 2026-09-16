// Multiple independent non-fatal issues in a single evidence-recording
// action (e.g. an enrollment failure AND a billing-link failure) must all
// reach the caller — a later warning must never silently overwrite an
// earlier, unrelated one. Pure so it can be unit tested without the
// Supabase/auth I/O the action itself requires.
export function combineWarnings(warnings: readonly string[]): string | undefined {
  return warnings.length > 0 ? warnings.join(" ") : undefined;
}
