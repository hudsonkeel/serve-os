import type { ExternalClientStatus, ResidenceType } from "@/lib/supabase/types";
import type { RelationshipWorkspaceRow } from "@/lib/relationships/search";
import type { RelationshipAttentionStatus } from "@/lib/relationships/attention";

// Pure search/grouping logic for the External Clients workspace
// (/external-clients). Mirrors lib/relationships/search.ts's pattern:
// tabs are lifecycle *views* over the same underlying Relationship rows,
// never a second data store (see docs/design/RELATIONSHIPS.md, "External
// Prospects must continue using the same underlying Relationship
// infrastructure").

export type ExternalClientTab = "prospects" | "active" | "on_hold" | "former";

export const EXTERNAL_CLIENT_TABS: { value: ExternalClientTab; label: string }[] = [
  { value: "prospects", label: "Prospects" },
  { value: "active", label: "Active Clients" },
  { value: "on_hold", label: "On Hold" },
  { value: "former", label: "Former Clients" },
];

// A row belongs in External Clients at all when it's an external prospect
// not yet converted, or it has a linked external_clients record (i.e. it
// went through one of the External Prospect → Active Client conversions).
// Resident-linked active_client Relationships (from Resident Prospect
// conversions) never appear here — see Part 9, "Resident-linked active
// clients belong in Relationships."
export interface ExternalClientWorkspaceRow extends RelationshipWorkspaceRow {
  nearestActionTitle: string | null;
  nearestActionDueAt: string | null;
  attentionStatus: RelationshipAttentionStatus;
  externalClientId: string | null;
  externalClientStatus: ExternalClientStatus | null;
  serviceStartDate: string | null;
  // Expected/operational service location — see
  // docs/design/RELATIONSHIPS.md, "External Prospect domain model."
  // Sourced from external_clients (once active) or the current
  // relationship_service_locations row (while prospecting); never from
  // `communityName` — External Clients are, by definition, outside a
  // supported community.
  city: string | null;
  state: string | null;
  postalCode: string | null;
  residenceType: ResidenceType | null;
  facilityName: string | null;
}

export function isExternalWorkspaceRow(row: {
  relationshipType: RelationshipWorkspaceRow["relationshipType"];
  residentId: string | null;
}): boolean {
  return row.relationshipType === "external_prospect" || (row.relationshipType === "active_client" && !row.residentId);
}

export function filterByExternalClientTab<T extends ExternalClientWorkspaceRow>(
  rows: readonly T[],
  tab: ExternalClientTab
): T[] {
  switch (tab) {
    case "prospects":
      return rows.filter((r) => r.relationshipType === "external_prospect" && r.status !== "closed");
    case "active":
      return rows.filter((r) => r.externalClientStatus === "active");
    case "on_hold":
      return rows.filter((r) => r.externalClientStatus === "on_hold");
    case "former":
      return rows.filter((r) => r.externalClientStatus === "former");
    default:
      return [...rows];
  }
}

export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function matchesExternalClientSearch(
  row: ExternalClientWorkspaceRow,
  normalizedQuery: string
): boolean {
  const haystack = [
    row.displayName,
    row.prospectiveResidentName,
    row.primaryContactName,
    row.primaryContactPhone,
    row.primaryContactEmail,
    row.city,
    row.postalCode,
    row.facilityName,
    row.ownerLabel,
  ];

  return haystack.some((field) => field && field.toLowerCase().includes(normalizedQuery));
}

export function countByTab<T extends ExternalClientWorkspaceRow>(
  rows: readonly T[]
): Record<ExternalClientTab, number> {
  return {
    prospects: filterByExternalClientTab(rows, "prospects").length,
    active: filterByExternalClientTab(rows, "active").length,
    on_hold: filterByExternalClientTab(rows, "on_hold").length,
    former: filterByExternalClientTab(rows, "former").length,
  };
}
