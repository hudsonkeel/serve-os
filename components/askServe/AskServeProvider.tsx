"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import { askServeReducer, initialAskServeState } from "@/lib/askServe/state";
import type { AskServeContext as AskServeContextPayload } from "@/lib/askServe/types";
import { AskServePanel } from "./AskServePanel";

interface AskServeContextValue {
  isOpen: boolean;
  context: AskServeContextPayload | null;
  open: (context: AskServeContextPayload) => void;
  close: () => void;
}

const AskServeStateContext = createContext<AskServeContextValue | null>(null);

// Ask Serve v0.1's only piece of app-wide client state — no Context
// provider of any kind existed in this app before this. Wrapping the tree
// once here (see app/layout.tsx) is what lets the panel stay open/closed
// across page navigations and lets any page reach it via useAskServe(),
// without prop-drilling through every server component's PageContainer.
export function AskServeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(askServeReducer, initialAskServeState);

  const value: AskServeContextValue = {
    isOpen: state.isOpen,
    context: state.context,
    open: (context) => dispatch({ type: "open", context }),
    close: () => dispatch({ type: "close" }),
  };

  return (
    <AskServeStateContext.Provider value={value}>
      {children}
      <AskServePanel />
    </AskServeStateContext.Provider>
  );
}

export function useAskServe(): AskServeContextValue {
  const ctx = useContext(AskServeStateContext);
  if (!ctx) {
    throw new Error("useAskServe must be used within an AskServeProvider");
  }
  return ctx;
}
