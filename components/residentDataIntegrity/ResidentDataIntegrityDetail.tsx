"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  confirmDuplicateImportRecord,
  correctIntegrityIssueMalformedField,
  dismissIntegrityIssueNotAnIssue,
  markIntegrityIssueInvestigating,
  returnIntegrityIssueToIdentityReview,
} from "@/lib/actions/residentDataIntegrity";
import type { ResidentComparisonRecord } from "@/lib/data/residentIdentity";
import { Badge } from "@/components/ui/Badge";

interface EvidenceEntry {
  signalType: string;
  description: string;
  rawValue?: string | null;
  normalizedValue?: string | null;
}

interface RemediationLogEntry {
  action: string;
  field?: string;
  before?: string | null;
  after?: string | null;
  actor?: string;
  at?: string;
  mergeEventId?: string;
  identityCandidateId?: string;
}

interface IssueRecord {
  id: string;
  issue_type: "same_import_duplicate" | "duplicate_source_row" | "malformed_phone" | "malformed_name";
  status: string;
  severity: "low" | "medium" | "high";
  evidence: EvidenceEntry[];
  source_system: string | null;
  source_file: string | null;
  import_batch: string | null;
  recommended_action: string | null;
  resolution: string | null;
  resolution_notes: string | null;
  remediation_log: RemediationLogEntry[];
}

interface ResidentDataIntegrityDetailProps {
  issue: IssueRecord;
  residents: ResidentComparisonRecord[];
  linkedCounts: Record<string, Record<string, number>>;
}

const ISSUE_TYPE_LABELS: Record<IssueRecord["issue_type"], string> = {
  same_import_duplicate: "Same-Import Duplicate",
  duplicate_source_row: "Duplicate Source Row",
  malformed_phone: "Malformed Phone",
  malformed_name: "Malformed Name",
};

const SEVERITY_TONE: Record<IssueRecord["severity"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const FIELD_LABEL = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";
const FIELD_INPUT =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60";

function totalLinkedRecords(counts: Record<string, number> | undefined): number {
  return Object.values(counts ?? {}).reduce((sum, n) => sum + n, 0);
}

function fullName(r: ResidentComparisonRecord): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.displayName || "Unnamed Resident";
}

const COMPARE_FIELDS: { key: keyof ResidentComparisonRecord; label: string }[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "middleName", label: "Middle Name" },
  { key: "preferredName", label: "Preferred Name" },
  { key: "unitNumber", label: "Apartment" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "sourceSystem", label: "Source System" },
  { key: "sourceFile", label: "Source File" },
  { key: "createdAt", label: "Created" },
];

const CORRECTABLE_FIELDS: { value: "phone" | "first_name" | "last_name" | "middle_name"; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "middle_name", label: "Middle Name" },
];

const isOpen = (status: string) => status === "open" || status === "investigating";

export function ResidentDataIntegrityDetail({ issue, residents, linkedCounts }: ResidentDataIntegrityDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<"none" | "confirm_duplicate" | "correct_field" | "return_to_identity" | "not_an_issue" | "investigate">("none");
  const [note, setNote] = useState("");
  const [canonicalId, setCanonicalId] = useState<string | null>(residents[0]?.id ?? null);
  const [correctResidentId, setCorrectResidentId] = useState<string | null>(residents[0]?.id ?? null);
  const [correctField, setCorrectField] = useState<(typeof CORRECTABLE_FIELDS)[number]["value"]>("phone");
  const [correctValue, setCorrectValue] = useState("");

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setActiveForm("none");
      setNote("");
      setCorrectValue("");
      router.refresh();
    });
  }

  const resolved = !isOpen(issue.status);
  const hasPair = residents.length === 2;
  const duplicateId = hasPair ? (canonicalId === residents[0].id ? residents[1].id : residents[0].id) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{ISSUE_TYPE_LABELS[issue.issue_type]}</Badge>
        <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity} severity</Badge>
        <Badge tone="neutral">{issue.status}</Badge>
      </div>

      {/* Why this is classified as an import-integrity issue */}
      <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
        <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">Why this is a data integrity issue</h3>
        <ul className="space-y-1.5">
          {issue.evidence.map((e, i) => (
            <li key={i} className="font-sans text-sm text-body">
              <span>{e.description}</span>
              {(e.rawValue || e.normalizedValue) && (
                <span className="ml-2 font-mono text-xs text-subtle">
                  raw: {e.rawValue ?? "—"} · normalized: {e.normalizedValue ?? "—"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Source provenance */}
      <div className="rounded-lg border border-ivory-border bg-surface px-5 py-4">
        <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">Source provenance</h3>
        <p className="font-sans text-sm text-body">
          Source system: {issue.source_system ?? "—"} · Source file: {issue.source_file ?? "—"} · Import batch: {issue.import_batch ?? "—"}
        </p>
        {issue.recommended_action && <p className="mt-1 font-sans text-sm text-muted">Recommended: {issue.recommended_action}</p>}
      </div>

      {/* Side-by-side comparison */}
      {residents.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-ivory-border bg-surface">
          <table className="w-full font-sans text-sm">
            <thead>
              <tr className="border-b border-ivory-border">
                <th className="px-4 py-2 text-left text-subtle">Field</th>
                {residents.map((r) => (
                  <th key={r.id} className="px-4 py-2 text-left text-body">
                    {fullName(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_FIELDS.map((f) => {
                const values = residents.map((r) => String(r[f.key] ?? "—"));
                const differs = new Set(values).size > 1;
                return (
                  <tr key={f.key} className="border-b border-ivory-border last:border-0">
                    <td className="px-4 py-2 text-subtle">{f.label}</td>
                    {values.map((v, i) => (
                      <td key={i} className={`px-4 py-2 ${differs ? "font-semibold text-body" : "text-muted"}`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t border-ivory-border">
                <td className="px-4 py-2 text-subtle">Linked records (total)</td>
                {residents.map((r) => (
                  <td key={r.id} className="px-4 py-2 text-body">
                    {totalLinkedRecords(linkedCounts[r.id])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>}

      {resolved ? (
        <div className="space-y-2 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
          <p className="font-sans text-sm text-subtle">
            This issue is resolved ({issue.status}). {issue.resolution}
          </p>
          {issue.remediation_log.length > 0 && (
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-widest text-subtle">Remediation preview</p>
              <ul className="mt-1 space-y-1">
                {issue.remediation_log.map((entry, i) => (
                  <li key={i} className="font-sans text-xs text-body">
                    {entry.action}
                    {entry.field && ` — ${entry.field}: "${entry.before ?? "—"}" → "${entry.after ?? "—"}"`}
                    {entry.actor && ` (${entry.actor})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
          <div className="flex flex-wrap gap-3">
            {hasPair && (
              <Button type="button" variant="primary" onClick={() => setActiveForm("confirm_duplicate")}>
                Confirm Duplicate Import Record
              </Button>
            )}
            <Button type="button" onClick={() => setActiveForm("correct_field")}>
              Correct Malformed Field
            </Button>
            {hasPair && (
              <Button type="button" size="small" onClick={() => setActiveForm("return_to_identity")}>
                Return to Identity Review
              </Button>
            )}
            <Button type="button" size="small" onClick={() => setActiveForm("investigate")}>
              Investigate Later
            </Button>
            <Button type="button" size="small" onClick={() => setActiveForm("not_an_issue")}>
              Not an Issue
            </Button>
          </div>

          {activeForm === "confirm_duplicate" && hasPair && (
            <div className="space-y-3 rounded-md border border-ivory-border bg-surface p-3">
              <div>
                <span className={FIELD_LABEL}>Canonical resident (kept active)</span>
                <div className="mt-1 flex gap-4">
                  {residents.map((r) => (
                    <label key={r.id} className="flex items-center gap-1.5 font-sans text-sm text-body">
                      <input type="radio" checked={canonicalId === r.id} onChange={() => setCanonicalId(r.id)} />
                      {fullName(r)}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className={FIELD_LABEL}>Rationale (optional)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={FIELD_INPUT} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPending || !canonicalId || !duplicateId}
                  onClick={() =>
                    runAction(() =>
                      confirmDuplicateImportRecord({
                        issueId: issue.id,
                        canonicalResidentId: canonicalId as string,
                        duplicateResidentId: duplicateId as string,
                        deferConsolidation: false,
                        rationale: note,
                      }),
                    )
                  }
                  className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Merge Now
                </button>
                <button
                  type="button"
                  disabled={isPending || !canonicalId || !duplicateId}
                  onClick={() =>
                    runAction(() =>
                      confirmDuplicateImportRecord({
                        issueId: issue.id,
                        canonicalResidentId: canonicalId as string,
                        duplicateResidentId: duplicateId as string,
                        deferConsolidation: true,
                        rationale: note,
                      }),
                    )
                  }
                  className="rounded-md border border-navy/30 px-3 py-1.5 font-sans text-sm font-semibold text-navy hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Defer Consolidation
                </button>
              </div>
              <p className="font-sans text-xs text-subtle">
                Reuses the same merge/consolidation workflow as Resident Identities — full history is preserved and the
                duplicate is deactivated and redirected, never deleted.
              </p>
            </div>
          )}

          {activeForm === "correct_field" && (
            <div className="space-y-3 rounded-md border border-ivory-border bg-surface p-3">
              {residents.length > 1 && (
                <div>
                  <span className={FIELD_LABEL}>Which record?</span>
                  <div className="mt-1 flex gap-4">
                    {residents.map((r) => (
                      <label key={r.id} className="flex items-center gap-1.5 font-sans text-sm text-body">
                        <input type="radio" checked={correctResidentId === r.id} onChange={() => setCorrectResidentId(r.id)} />
                        {fullName(r)}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label className="block">
                <span className={FIELD_LABEL}>Field</span>
                <select value={correctField} onChange={(e) => setCorrectField(e.target.value as typeof correctField)} className={FIELD_INPUT}>
                  {CORRECTABLE_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={FIELD_LABEL}>Corrected value</span>
                <input value={correctValue} onChange={(e) => setCorrectValue(e.target.value)} className={FIELD_INPUT} />
              </label>
              <button
                type="button"
                disabled={isPending || !correctResidentId || !correctValue.trim()}
                onClick={() =>
                  runAction(() =>
                    correctIntegrityIssueMalformedField({
                      issueId: issue.id,
                      residentId: correctResidentId as string,
                      field: correctField,
                      newValue: correctValue,
                    }),
                  )
                }
                className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm Correction
              </button>
              <p className="font-sans text-xs text-subtle">The prior and raw values are preserved in the remediation log — nothing is silently discarded.</p>
            </div>
          )}

          {activeForm === "return_to_identity" && hasPair && (
            <div className="space-y-2 rounded-md border border-ivory-border bg-surface p-3">
              <label className="block">
                <span className={FIELD_LABEL}>Note (optional)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={FIELD_INPUT} />
              </label>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runAction(() =>
                    returnIntegrityIssueToIdentityReview({
                      issueId: issue.id,
                      residentIds: [residents[0].id, residents[1].id],
                      note,
                    }),
                  )
                }
                className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          )}

          {activeForm === "investigate" && (
            <div className="space-y-2 rounded-md border border-ivory-border bg-surface p-3">
              <label className="block">
                <span className={FIELD_LABEL}>Note for later review (optional)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={FIELD_INPUT} />
              </label>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => markIntegrityIssueInvestigating({ issueId: issue.id, note }))}
                className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          )}

          {activeForm === "not_an_issue" && (
            <div className="space-y-2 rounded-md border border-ivory-border bg-surface p-3">
              <label className="block">
                <span className={FIELD_LABEL}>Why is this not an issue?</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={FIELD_INPUT} />
              </label>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => dismissIntegrityIssueNotAnIssue({ issueId: issue.id, reason: note }))}
                className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm
              </button>
              <p className="font-sans text-xs text-subtle">
                Dismissing suppresses this exact issue from being re-created automatically, unless the underlying evidence changes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
