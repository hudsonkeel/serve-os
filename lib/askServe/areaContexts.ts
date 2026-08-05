// Base operational context for each top-level Serve OS area, and one
// intermediate level (Relationships) nested under The People We Serve —
// the concrete instance of the Operational Context Hierarchy described in
// docs/architecture/ASK_SERVE_ARCHITECTURE.md:
//
//   Serve OS -> The People We Serve -> Relationships -> Action Board
//
// A leaf surface builds its context with
// buildAskServeContext(RELATIONSHIPS_CONTEXT, { surface: "relationship_action_board", ... })
// rather than restating knowledgeProfile/subjectType/route from scratch —
// it inherits everything above it and only states what's new at its
// depth. `userRole` is deliberately NOT set here: it's per-request (which
// user is looking), so every call site adds it via override, never baked
// into a shared constant.
import type { AskServeContext } from "./types.ts";

export const TODAY_WORK_CONTEXT: AskServeContext = {
  surface: "today_work",
  route: "/workspace",
  pageTitle: "Today's Work",
  subjectType: "today_work",
  knowledgeProfile: "today_work",
  capabilityLevel: "explain",
};

export const PEOPLE_WE_SERVE_CONTEXT: AskServeContext = {
  surface: "people_we_serve",
  route: "/residents",
  pageTitle: "The People We Serve",
  knowledgeProfile: "people_we_serve",
  capabilityLevel: "explain",
};

// Relationships -> The People We Serve. Its own list/detail/Action Board/
// Whiteboard/Intake surfaces all build on THIS, not directly on
// PEOPLE_WE_SERVE_CONTEXT, so the 3-level chain (area -> Relationships ->
// specific view) is real in code, not just conceptual.
export const RELATIONSHIPS_CONTEXT: AskServeContext = {
  ...PEOPLE_WE_SERVE_CONTEXT,
  surface: "relationships",
  route: "/relationships",
  pageTitle: "The People We Serve · Relationships",
  subjectType: "relationship_collection",
};

export const PEOPLE_WHO_SERVE_CONTEXT: AskServeContext = {
  surface: "people_who_serve",
  route: "/recruiting",
  pageTitle: "The People Who Serve",
  knowledgeProfile: "people_who_serve",
  capabilityLevel: "explain",
};

export const ORGANIZATION_PERFORMANCE_CONTEXT: AskServeContext = {
  surface: "organization_performance",
  route: "/",
  pageTitle: "How We're Doing",
  subjectType: "organization",
  knowledgeProfile: "organization_performance",
  capabilityLevel: "explain",
};

export const COMMUNITY_OUTLOOK_CONTEXT: AskServeContext = {
  surface: "community_outlook",
  route: "/community-intelligence",
  pageTitle: "Community Outlook",
  subjectType: "community",
  knowledgeProfile: "community_outlook",
  capabilityLevel: "explain",
};
