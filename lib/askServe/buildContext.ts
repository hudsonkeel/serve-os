// Context inheritance — the mechanism behind the Operational Context
// Hierarchy in docs/architecture/ASK_SERVE_ARCHITECTURE.md: a deeper
// operational surface never has to restate what its parent already
// established (knowledgeProfile, base route, subject framing, ...); it
// only specifies what's NEW at its depth. Whatever the child explicitly
// provides always wins — "the deepest valid operational context always
// wins" — everything else is carried forward from the parent. Pure, no
// I/O, fully unit-testable; this one function IS the reusable pattern
// every future operational surface follows, not a framework around it.
import type { AskServeContext } from "./types.ts";

export function buildAskServeContext(parent: AskServeContext, overrides: Partial<AskServeContext>): AskServeContext {
  return { ...parent, ...overrides };
}
