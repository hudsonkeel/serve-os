"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ResidentComparisonRecord } from "@/lib/data/residentIdentity";

interface EvidenceEntry {
  signalType: string;
  description: string;
  rawValue?: string | null;
  normalizedValue?: string | null;
}

interface IssueRow {
  id: string;
  issue_type: "same_import_duplicate" | "duplicate_source_row" | "malformed_phone" | "malformed_name";
  status: string;
  severity: "low" | "medium" | "high";
  evidence: EvidenceEntry[];
  source_system: string | null;
  source_file: string | null;
  import_batch: string | null;
  recommended_action: string | null;
  created_at: string;
}

interface ResidentDataIntegrityQueueProps {
  issues: IssueRow[];
  memberIdsByIssue: Record<string, string[]>;
  residentsById: Record<string, ResidentComparisonRecord>;
}

const ISSUE_TYPE_LABELS: Record<IssueRow["issue_type"], string> = {
  same_import_duplicate: "Same-Import Duplicate",
  duplicate_source_row: "Duplicate Source Row",
  malformed_phone: "Malformed Phone",
  malformed_name: "Malformed Name",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved_merged: "Confirmed Duplicate — Merged",
  resolved_corrected: "Corrected",
  resolved_returned_to_identity_review: "Returned to Identity Review",
  dismissed_not_an_issue: "Not an Issue",
};

const SEVERITY_TONE: Record<IssueRow["severity"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

type FilterTab = "open" | "same_import_duplicate" | "duplicate_source_row" | "malformed_phone" | "malformed_name" | "resolved" | "all";

function residentLabel(resident: ResidentComparisonRecord | undefined): string {
  if (!resident) return "Unknown resident";
  const name = [resident.firstName, resident.lastName].filter(Boolean).join(" ") || resident.displayName || "Unnamed";
  return resident.unitNumber ? `${name} — Unit ${resident.unitNumber}` : name;
}

const isOpen = (status: string) => status === "open" || status === "investigating";

export function ResidentDataIntegrityQueue({ issues, memberIdsByIssue, residentsById }: ResidentDataIntegrityQueueProps) {
  const [tab, setTab] = useState<FilterTab>("open");

  const filtered = useMemo(() => {
    switch (tab) {
      case "open":
        return issues.filter((i) => isOpen(i.status));
      case "resolved":
        return issues.filter((i) => !isOpen(i.status));
      case "all":
        return issues;
      default:
        return issues.filter((i) => i.issue_type === tab && isOpen(i.status));
    }
  }, [issues, tab]);

  const tabs: { value: FilterTab; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "same_import_duplicate", label: "Same-Import Duplicate" },
    { value: "duplicate_source_row", label: "Duplicate Source Row" },
    { value: "malformed_phone", label: "Malformed Phone" },
    { value: "malformed_name", label: "Malformed Name" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-ivory-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors ${
              tab === t.value ? "bg-navy text-white" : "bg-ivory-warm text-muted hover:bg-ivory-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState description="No data integrity issues in this view." />
      ) : (
        <div className="space-y-3">
          {filtered.map((issue) => {
            const memberIds = memberIdsByIssue[issue.id] ?? [];
            const members = memberIds.map((id) => residentsById[id]);
            const topEvidence = issue.evidence[0];
            const sourceLabel = [issue.source_file, issue.import_batch].filter(Boolean).join(" — ");

            return (
              <Link
                key={issue.id}
                href={`/resident-data-integrity/${issue.id}`}
                className="block rounded-lg border border-ivory-border bg-ivory px-5 py-4 transition-colors hover:border-navy/30"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{ISSUE_TYPE_LABELS[issue.issue_type]}</Badge>
                  <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity} severity</Badge>
                  <Badge tone="neutral">{STATUS_LABELS[issue.status] ?? issue.status}</Badge>
                  <span className="font-sans text-sm text-subtle">
                    {new Date(issue.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <p className="font-sans text-base font-semibold text-body">
                  {members.length > 0 ? members.map((m) => residentLabel(m)).join(" & ") : "Affected records unavailable"}
                </p>
                {topEvidence && <p className="mt-1 font-sans text-sm text-muted">{topEvidence.description}</p>}
                {sourceLabel && <p className="mt-1 font-sans text-xs text-subtle">Source: {sourceLabel}</p>}
                {issue.recommended_action && (
                  <p className="mt-1 font-sans text-xs text-subtle">Recommended: {issue.recommended_action}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
