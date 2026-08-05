// Route -> Knowledge Profile mapping, and the v0.1 "not yet connected"
// copy shown per profile in the Ask Serve panel. See
// docs/architecture/ASK_SERVE_ARCHITECTURE.md's "Knowledge Profiles"
// section for why this is an operational perspective, not just a filter.
import type { AskServeKnowledgeProfile } from "./types.ts";

const ROUTE_PROFILES: readonly { prefix: string; profile: AskServeKnowledgeProfile }[] = [
  { prefix: "/workspace", profile: "today_work" },
  { prefix: "/residents", profile: "people_we_serve" },
  { prefix: "/relationships", profile: "people_we_serve" },
  { prefix: "/external-clients", profile: "people_we_serve" },
  { prefix: "/recruiting", profile: "people_who_serve" },
  { prefix: "/community-intelligence", profile: "community_outlook" },
];

// The dashboard route ("/") needs an exact match, not a prefix match —
// every other route also starts with "/", so it's handled separately
// rather than added to ROUTE_PROFILES (mirrors the same exact-vs-prefix
// distinction Sidebar.tsx's own isActive() already makes for "/").
//
// /settings has no entry here on purpose — it falls through to "general"
// below, which IS its intended mapping (organization-wide, no specific
// operational perspective), not an oversight.
export function getKnowledgeProfileForRoute(pathname: string): AskServeKnowledgeProfile {
  if (pathname === "/") return "organization_performance";
  const match = ROUTE_PROFILES.find((r) => pathname.startsWith(r.prefix));
  return match?.profile ?? "general";
}

export interface KnowledgeProfileCopy {
  readonly heading: string;
  readonly description: string;
  readonly exampleQuestions: readonly string[];
}

export const KNOWLEDGE_PROFILE_COPY: Record<AskServeKnowledgeProfile, KnowledgeProfileCopy> = {
  today_work: {
    heading: "Ask Serve about today's work",
    description:
      "Ask Serve will eventually reason over tasks, follow-ups, due dates, assigned work, the schedule, and operational exceptions to help you understand what needs attention today and what you left unfinished.",
    exampleQuestions: [
      "What needs my attention today?",
      "What did I leave unfinished?",
      "What should I resume first?",
      "Which commitments have no follow-up?",
      "What should I not forget?",
    ],
  },
  people_we_serve: {
    heading: "Ask Serve about the people we serve",
    description:
      "Ask Serve will eventually use current needs, timeline, wellness history, relationships, visits, assessments, and permitted care information to answer grounded questions about the people Serve supports.",
    exampleQuestions: [
      "What has changed recently?",
      "Who needs follow-up?",
      "What information is missing?",
      "What care or relationship concerns are emerging?",
    ],
  },
  people_who_serve: {
    heading: "Ask Serve about the people who serve",
    description:
      "Ask Serve will eventually reason over candidates, recruiting stages, onboarding, training, credentials, compliance, and workforce readiness to help you understand the people who provide care.",
    exampleQuestions: [
      "Which candidates are stalled?",
      "Who is not ready to work?",
      "What training or compliance items are outstanding?",
      "Where are staffing gaps emerging?",
    ],
  },
  organization_performance: {
    heading: "Ask Serve about how we're doing",
    description:
      "Ask Serve will eventually reason over organization KPIs, quality, compliance, productivity, and capacity to help you understand overall performance.",
    exampleQuestions: [
      "What changed?",
      "What is driving performance?",
      "Which metrics need attention?",
      "What risks are emerging?",
    ],
  },
  community_outlook: {
    heading: "Ask Serve about this community",
    description:
      "Ask Serve will eventually reason over community-level patterns, referral opportunities, staffing conditions, and early warning signals to help you understand emerging conditions.",
    exampleQuestions: [
      "What is changing in this community?",
      "Which needs are emerging?",
      "Where are relationships weakening?",
      "What opportunities deserve attention?",
    ],
  },
  general: {
    heading: "Ask Serve",
    description:
      "Ask Serve will eventually reason across the sources you're permitted to access to help you investigate, understand priorities, and review supporting evidence.",
    exampleQuestions: [
      "What should I pay attention to?",
      "What changed recently?",
      "What's missing information?",
    ],
  },
};
