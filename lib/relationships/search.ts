import type { PipelineStage, RelationshipStatus, RelationshipType } from "@/lib/supabase/types";

// Pure search/filter logic for the Relationships workspace table. Mirrors
// the pattern established for the Residents directory
// (lib/residents/search.ts): zero-result groups/filters are hidden by the
// UI rather than rendered as empty placeholders, one unified "no results"
// state covers the fully-empty case, and search only matches fields the
// implementation actually supports.

export interface RelationshipWorkspaceRow {
  id: string;
  displayName: string;
  relationshipType: RelationshipType;
  stage: PipelineStage;
  status: RelationshipStatus;
  residentId: string | null;
  residentName: string | null;
  ownerLabel: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  primaryContactEmail: string | null;
  organizationName: string | null;
  communityName: string | null;
}

export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

// Fields actually matched: relationship name, resident name, primary
// contact name/phone/email, organization name, community name. Nothing
// else on the row is searched.
export function matchesRelationshipSearch(
  row: RelationshipWorkspaceRow,
  normalizedQuery: string
): boolean {
  const haystack = [
    row.displayName,
    row.residentName,
    row.primaryContactName,
    row.primaryContactPhone,
    row.primaryContactEmail,
    row.organizationName,
    row.communityName,
  ];

  return haystack.some(
    (field) => field && field.toLowerCase().includes(normalizedQuery)
  );
}

export type RelationshipFilterValue =
  | "all"
  | "resident_prospects"
  | "external_prospects"
  | "active_clients"
  | "partners_referrals"
  | "on_hold"
  | "closed";

export const RELATIONSHIP_FILTER_OPTIONS: { value: RelationshipFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "resident_prospects", label: "Resident Prospects" },
  { value: "external_prospects", label: "External Prospects" },
  { value: "active_clients", label: "Active Clients" },
  { value: "partners_referrals", label: "Partners / Referral Sources" },
  { value: "on_hold", label: "On Hold" },
  { value: "closed", label: "Closed" },
];

export function filterByRelationshipFilter<T extends RelationshipWorkspaceRow>(
  rows: T[],
  filter: RelationshipFilterValue
): T[] {
  switch (filter) {
    case "resident_prospects":
      return rows.filter((r) => r.relationshipType === "resident_prospect");
    case "external_prospects":
      return rows.filter((r) => r.relationshipType === "external_prospect");
    case "active_clients":
      return rows.filter((r) => r.relationshipType === "active_client");
    case "partners_referrals":
      return rows.filter(
        (r) => r.relationshipType === "referral_source" || r.relationshipType === "community_partner"
      );
    case "on_hold":
      return rows.filter((r) => r.status === "on_hold");
    case "closed":
      return rows.filter((r) => r.status === "closed");
    case "all":
    default:
      return rows;
  }
}
