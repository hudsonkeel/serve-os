// No feature-flag framework exists anywhere in this repo (confirmed: no
// GrowthBook/LaunchDarkly/env-based flag system). Per the rollout plan in
// docs/architecture/ASK_SERVE_ARCHITECTURE.md, this is a single documented
// stand-in — internal/admin users first — not a new framework. Replace
// with a real flag system if/when one is introduced repo-wide; do not grow
// this file into one.
import type { AuthRole } from "../auth/constants.ts";

export function isContextualAskServeEnabled(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}
