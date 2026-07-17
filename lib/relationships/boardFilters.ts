import type {
  PipelineStage,
  RelationshipPriority,
  RelationshipStatus,
  RelationshipType,
} from "@/lib/supabase/types";

// Shared filter model for the Action Board and Whiteboard (Part 13).
// "Mine" is deliberately not implemented — owner_label is free text with
// no autocomplete or validation against a real staff list (see
// docs/design/RELATIONSHIPS.md, "Ownership and staff identity"), so
// comparing it against the current actor's full_name/email would silently
// miss anyone who typed their own name differently ("Brian" vs "Brian
// Smith" vs an email address). An unreliable "Mine" filter that quietly
// hides relevant work is worse than no filter at all.

export type ResidentLinkFilter = "all" | "linked" | "external";
export type StatusFilter = "all" | "active" | "on_hold" | "closed";

// Sentinel values for the free-text Owner/Community filters (there's no
// controlled value list for either — see "Ownership and staff identity" in
// docs/design/RELATIONSHIPS.md). "all" means no filter; "__unassigned__"
// specifically means "rows where this field is null," since null can't be
// one of the dropdown's real option values.
export const ALL_VALUE = "all";
export const UNASSIGNED_VALUE = "__unassigned__";

export interface BoardFilterState {
  relationshipType: RelationshipType | "all";
  stage: PipelineStage | "all";
  ownerLabel: string;
  communityName: string;
  priority: RelationshipPriority | "all";
  residentLink: ResidentLinkFilter;
  status: StatusFilter;
}

export const DEFAULT_BOARD_FILTERS: BoardFilterState = {
  relationshipType: "all",
  stage: "all",
  ownerLabel: ALL_VALUE,
  communityName: ALL_VALUE,
  priority: "all",
  residentLink: "all",
  status: "all",
};

function matchesTextFilter(value: string | null, filterValue: string): boolean {
  if (filterValue === ALL_VALUE) return true;
  if (filterValue === UNASSIGNED_VALUE) return !value;
  return value === filterValue;
}

export interface FilterableRow {
  relationshipType: RelationshipType;
  stage: PipelineStage;
  status: RelationshipStatus;
  ownerLabel: string | null;
  communityName: string | null;
  priority: RelationshipPriority;
  residentId: string | null;
}

export function applyBoardFilters<T extends FilterableRow>(
  rows: readonly T[],
  filters: BoardFilterState
): T[] {
  return rows.filter((row) => {
    if (filters.relationshipType !== "all" && row.relationshipType !== filters.relationshipType) {
      return false;
    }
    if (filters.stage !== "all" && row.stage !== filters.stage) {
      return false;
    }
    if (!matchesTextFilter(row.ownerLabel, filters.ownerLabel)) {
      return false;
    }
    if (!matchesTextFilter(row.communityName, filters.communityName)) {
      return false;
    }
    if (filters.priority !== "all" && row.priority !== filters.priority) {
      return false;
    }
    if (filters.residentLink === "linked" && !row.residentId) {
      return false;
    }
    if (filters.residentLink === "external" && row.residentId) {
      return false;
    }
    if (filters.status !== "all" && row.status !== filters.status) {
      return false;
    }
    return true;
  });
}

// Distinct, sorted values present in the current row set — used to build
// the Owner/Community filter dropdowns from real data rather than a
// hardcoded list that could drift out of sync with what's actually in use.
export function distinctPresentValues(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}
