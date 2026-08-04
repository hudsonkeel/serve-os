// Ask Serve v0.1 — typed context contract. See
// docs/architecture/ASK_SERVE_ARCHITECTURE.md for the full architecture:
// the north-star framing (Ask Serve is Serve OS's contextual reasoning
// layer, not a chatbot), the Knowledge Profile definition (an operational
// perspective, not a retrieval filter), the six-layer Context Stack this
// type partially implements (layers 1-4 only; 5-6 are future retrieval/
// intent work), and the Read -> Explain -> Recommend -> Prepare -> Execute
// capability progression this v0.1 stops at "Explain" (UI shell only).

export type AskServeSubjectType =
  | "resident"
  | "resident_collection"
  | "employee"
  | "candidate"
  | "candidate_collection"
  | "community"
  | "organization"
  | "relationship"
  | "relationship_collection"
  | "external_client_collection"
  | "today_work";

// The operational perspective Ask Serve should reason from in a given area
// of the app — shapes both which knowledge is preferred and what kinds of
// questions naturally emerge there. "general" is the organization-wide
// fallback when no more specific perspective applies — deliberately not
// called "global", which gets ambiguous as the system grows. Distinct from
// organization_performance, which is a specific perspective (How We're
// Doing), not a catch-all.
export type AskServeKnowledgeProfile =
  | "today_work"
  | "people_we_serve"
  | "people_who_serve"
  | "organization_performance"
  | "community_outlook"
  | "general";

export interface AskServeContext {
  readonly surface: string;
  readonly route: string;
  readonly pageTitle?: string;

  readonly subjectType?: AskServeSubjectType;
  readonly subjectId?: string;
  readonly subjectLabel?: string;

  readonly visibleFilters?: Record<string, string | string[] | number | boolean>;
  readonly dateRange?: {
    readonly start?: string;
    readonly end?: string;
  };

  readonly userRole?: string;

  // No organizationId/communityId field exists here: this app is
  // confirmed single-tenant (one community, "Serve Caregiving") with no
  // such identifiers anywhere in its schema. Adding one now would be a
  // fabricated field with nothing real to populate it — see "Avoid
  // premature abstraction" in docs/architecture/ASK_SERVE_ARCHITECTURE.md.
  // Add it here, for real, the day this app supports more than one.

  readonly knowledgeProfile?: AskServeKnowledgeProfile;

  // The capability envelope available for this context TODAY — not a
  // promise of what Ask Serve could theoretically do. Every context
  // constructed in this phase sets "explain": Read (context construction)
  // and the Explain UI shell are built; Recommend/Prepare/Execute are not,
  // so they are deliberately not selectable values yet. See "Future
  // capability boundaries" in docs/architecture/ASK_SERVE_ARCHITECTURE.md.
  readonly capabilityLevel?: "read" | "explain";
}
