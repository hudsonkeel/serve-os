"use client";

import {
  ALL_VALUE,
  UNASSIGNED_VALUE,
  distinctPresentValues,
  type BoardFilterState,
  type FilterableRow,
} from "@/lib/relationships/boardFilters";
import {
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_TYPES,
} from "@/lib/relationships/constants";

const selectClassName =
  "h-10 rounded-md border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60";

interface RelationshipFilterBarProps {
  rows: readonly FilterableRow[];
  filters: BoardFilterState;
  onChange: (filters: BoardFilterState) => void;
  // Action Board excludes closed relationships entirely (Part 15: closed
  // means nothing is owed), so it has no use for a Status filter — only
  // the Whiteboard, which shows every status, needs one.
  showStatusFilter?: boolean;
}

export function RelationshipFilterBar({
  rows,
  filters,
  onChange,
  showStatusFilter = false,
}: RelationshipFilterBarProps) {
  const owners = distinctPresentValues(rows.map((r) => r.ownerLabel));
  const communities = distinctPresentValues(rows.map((r) => r.communityName));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filters.relationshipType}
        onChange={(e) => onChange({ ...filters, relationshipType: e.target.value as BoardFilterState["relationshipType"] })}
        className={selectClassName}
        aria-label="Filter by relationship type"
      >
        <option value={ALL_VALUE}>All Types</option>
        {RELATIONSHIP_TYPES.map((value) => (
          <option key={value} value={value}>
            {RELATIONSHIP_TYPE_LABELS[value]}
          </option>
        ))}
      </select>

      <select
        value={filters.stage}
        onChange={(e) => onChange({ ...filters, stage: e.target.value as BoardFilterState["stage"] })}
        className={selectClassName}
        aria-label="Filter by stage"
      >
        <option value={ALL_VALUE}>All Stages</option>
        {RELATIONSHIP_STAGES.map((value) => (
          <option key={value} value={value}>
            {RELATIONSHIP_STAGE_LABELS[value]}
          </option>
        ))}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => onChange({ ...filters, priority: e.target.value as BoardFilterState["priority"] })}
        className={selectClassName}
        aria-label="Filter by priority"
      >
        <option value={ALL_VALUE}>All Priorities</option>
        {RELATIONSHIP_PRIORITIES.map((value) => (
          <option key={value} value={value}>
            {RELATIONSHIP_PRIORITY_LABELS[value]}
          </option>
        ))}
      </select>

      <select
        value={filters.ownerLabel}
        onChange={(e) => onChange({ ...filters, ownerLabel: e.target.value })}
        className={selectClassName}
        aria-label="Filter by owner"
      >
        <option value={ALL_VALUE}>All Owners</option>
        <option value={UNASSIGNED_VALUE}>Unassigned</option>
        {owners.map((owner) => (
          <option key={owner} value={owner}>
            {owner}
          </option>
        ))}
      </select>

      <select
        value={filters.communityName}
        onChange={(e) => onChange({ ...filters, communityName: e.target.value })}
        className={selectClassName}
        aria-label="Filter by community"
      >
        <option value={ALL_VALUE}>All Communities</option>
        <option value={UNASSIGNED_VALUE}>No Community</option>
        {communities.map((community) => (
          <option key={community} value={community}>
            {community}
          </option>
        ))}
      </select>

      <select
        value={filters.residentLink}
        onChange={(e) => onChange({ ...filters, residentLink: e.target.value as BoardFilterState["residentLink"] })}
        className={selectClassName}
        aria-label="Filter by resident link"
      >
        <option value="all">Resident-Linked or External</option>
        <option value="linked">Resident-Linked Only</option>
        <option value="external">External Only</option>
      </select>

      {showStatusFilter && (
        <select
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value as BoardFilterState["status"] })}
          className={selectClassName}
          aria-label="Filter by status"
        >
          <option value="all">Active, On Hold, or Closed</option>
          <option value="active">Active Only</option>
          <option value="on_hold">On Hold Only</option>
          <option value="closed">Closed Only</option>
        </select>
      )}
    </div>
  );
}
