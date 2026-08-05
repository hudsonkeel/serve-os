// Pure reducer for the Ask Serve panel's open/closed state — no React, no
// I/O, fully unit-testable. components/askServe/AskServeProvider.tsx wires
// this into useReducer(); nothing about panel behavior lives outside this
// function, so "open/close behavior" and "context construction" are
// verifiable without rendering a component.
import type { AskServeContext } from "./types.ts";

export interface AskServeState {
  readonly isOpen: boolean;
  readonly context: AskServeContext | null;
}

export type AskServeAction = { type: "open"; context: AskServeContext } | { type: "close" };

export const initialAskServeState: AskServeState = { isOpen: false, context: null };

export function askServeReducer(state: AskServeState, action: AskServeAction): AskServeState {
  switch (action.type) {
    case "open":
      return { isOpen: true, context: action.context };
    case "close":
      return { isOpen: false, context: null };
    default:
      return state;
  }
}
