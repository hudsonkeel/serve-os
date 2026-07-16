import type {
  CommunityResidentRecord,
  ResidentTabValue,
} from "@/lib/data/communityMetrics";

// Pure resident search/grouping logic for the Residents directory
// (components/residents/ResidentsInbox.tsx) — kept separate from the
// client component so it can be unit tested without React or a DOM.

export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function matchesSearch(
  record: CommunityResidentRecord,
  normalizedQuery: string
): boolean {
  const resident = record.resident;
  const haystack = [
    resident.first_name,
    resident.last_name,
    resident.preferred_name,
    resident.display_name,
    resident.full_name,
    resident.unit_number,
    // Staff-captured "goes by" nickname (resident_relationship_profiles.preferred_name),
    // e.g. searching "Mick" should return Michele Helsley.
    record.preferredNickname,
  ];

  return haystack.some(
    (field) => field && field.toLowerCase().includes(normalizedQuery)
  );
}

export function filterByTab(
  records: CommunityResidentRecord[],
  tab: ResidentTabValue
): CommunityResidentRecord[] {
  switch (tab) {
    case "serve_prospects":
      return records.filter(
        (record) => record.serveRelationshipStatus === "prospect"
      );
    case "active_clients":
      return records.filter(
        (record) => record.serveRelationshipStatus === "active_client"
      );
    case "hold":
      return records.filter(
        (record) => record.serveRelationshipStatus === "hold"
      );
    case "former_clients":
      return records.filter(
        (record) => record.serveRelationshipStatus === "former_client"
      );
    case "wellness_watch":
      // Deterministic: at least one open/in_progress resident_wellness_follow_ups
      // row (see getWellnessWatchSummaryByResident()) — not the legacy
      // imported serve_relationship_status = 'wellness_watch' value.
      return records.filter((record) => record.wellnessWatch !== null);
    default:
      return records;
  }
}

export interface ResidentSearchGroup {
  key: string;
  heading: string;
  records: CommunityResidentRecord[];
}

// Blended "All Residents" view: active clients, then prospects, then
// everyone else. When a search query is active, groups with zero matches
// are dropped entirely rather than rendered as empty cards — otherwise a
// match several sections down reads as "no results" until the user
// scrolls past large empty placeholders. Groups are never dropped when
// there's no active query, so the normal directory view (including each
// section's own "nothing here yet" empty state) is unchanged.
export function buildBlendedGroups(
  records: CommunityResidentRecord[],
  normalizedQuery: string
): ResidentSearchGroup[] {
  const activeClients = records.filter(
    (record) => record.serveRelationshipStatus === "active_client"
  );
  const prospects = records.filter(
    (record) => record.serveRelationshipStatus === "prospect"
  );
  const others = records.filter(
    (record) =>
      record.serveRelationshipStatus !== "active_client" &&
      record.serveRelationshipStatus !== "prospect"
  );

  const applySearch = (bucket: CommunityResidentRecord[]) =>
    normalizedQuery
      ? bucket.filter((record) => matchesSearch(record, normalizedQuery))
      : bucket;

  const groups: ResidentSearchGroup[] = [
    { key: "active", heading: "Active Serve Clients", records: applySearch(activeClients) },
    { key: "prospects", heading: "Serve Prospects", records: applySearch(prospects) },
    { key: "others", heading: "All Other Watermere Residents", records: applySearch(others) },
  ];

  if (!normalizedQuery) return groups;
  return groups.filter((group) => group.records.length > 0);
}

export function countGroupRecords(groups: ResidentSearchGroup[]): number {
  return groups.reduce((total, group) => total + group.records.length, 0);
}
