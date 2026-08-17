"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAuditSessionCorrectionAction } from "@/lib/actions/auditReadiness";
import type { AuditSessionItemFinding, AuditSessionItemSubjectType } from "@/lib/supabase/types";
import type { ItemCorrectionInput } from "@/lib/data/auditSessionCorrections";

export interface OriginalItemForCorrection {
  auditSessionItemId: string;
  requirementId: string;
  requirementCode: string;
  requirementName: string;
  subjectType: AuditSessionItemSubjectType;
  subjectId: string;
  subjectLabel: string;
  originalFinding: AuditSessionItemFinding;
  originalNotes: string | null;
}

export interface AddableOption {
  subjectId: string;
  subjectLabel: string;
  requirementId: string;
  requirementCode: string;
  requirementName: string;
}

const FINDING_OPTIONS: { value: AuditSessionItemFinding; label: string }[] = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "evidence_missing", label: "Evidence Missing" },
  { value: "needs_review", label: "Needs Review" },
];
const FINDING_LABELS: Record<AuditSessionItemFinding, string> = {
  pass: "Pass",
  fail: "Fail",
  evidence_missing: "Evidence Missing",
  needs_review: "Needs Review",
};

interface EditState {
  finding: AuditSessionItemFinding;
  notes: string;
  removed: boolean;
}

interface Addition {
  key: string;
  subjectId: string;
  subjectLabel: string;
  requirementId: string;
  requirementName: string;
  finding: AuditSessionItemFinding;
  notes: string;
}

function groupBySubject<T extends { subjectId: string; subjectLabel: string }>(rows: T[]): { subjectId: string; subjectLabel: string; rows: T[] }[] {
  const groups = new Map<string, { subjectId: string; subjectLabel: string; rows: T[] }>();
  for (const row of rows) {
    const existing = groups.get(row.subjectId);
    if (existing) existing.rows.push(row);
    else groups.set(row.subjectId, { subjectId: row.subjectId, subjectLabel: row.subjectLabel, rows: [row] });
  }
  return Array.from(groups.values());
}

export function CorrectionModeEditor({
  sessionId,
  originalItems,
  addableOptions,
}: {
  sessionId: string;
  originalItems: OriginalItemForCorrection[];
  addableOptions: AddableOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [edits, setEdits] = useState<Record<string, EditState>>(() =>
    Object.fromEntries(
      originalItems.map((item) => [item.auditSessionItemId, { finding: item.originalFinding, notes: item.originalNotes ?? "", removed: false }])
    )
  );
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [addSubjectId, setAddSubjectId] = useState("");
  const [addRequirementId, setAddRequirementId] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => groupBySubject(originalItems), [originalItems]);
  const addSubjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of addableOptions) seen.set(o.subjectId, o.subjectLabel);
    return Array.from(seen.entries()).map(([subjectId, subjectLabel]) => ({ subjectId, subjectLabel }));
  }, [addableOptions]);
  const alreadyRecordedRequirementIds = useMemo(
    () => new Set(originalItems.filter((i) => i.subjectId === addSubjectId).map((i) => i.requirementId)),
    [originalItems, addSubjectId]
  );
  const alreadyAddedRequirementIds = useMemo(
    () => new Set(additions.filter((a) => a.subjectId === addSubjectId).map((a) => a.requirementId)),
    [additions, addSubjectId]
  );
  const addRequirementOptions = addableOptions.filter(
    (o) => o.subjectId === addSubjectId && !alreadyRecordedRequirementIds.has(o.requirementId) && !alreadyAddedRequirementIds.has(o.requirementId)
  );

  function updateEdit(itemId: string, patch: Partial<EditState>) {
    setEdits((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function addFinding() {
    const option = addableOptions.find((o) => o.subjectId === addSubjectId && o.requirementId === addRequirementId);
    if (!option) return;
    setAdditions((prev) => [
      ...prev,
      {
        key: `${option.subjectId}-${option.requirementId}-${prev.length}`,
        subjectId: option.subjectId,
        subjectLabel: option.subjectLabel,
        requirementId: option.requirementId,
        requirementName: option.requirementName,
        finding: "pass",
        notes: "",
      },
    ]);
    setAddRequirementId("");
  }

  function removeAddition(key: string) {
    setAdditions((prev) => prev.filter((a) => a.key !== key));
  }

  const itemCorrections: ItemCorrectionInput[] = useMemo(() => {
    const corrections: ItemCorrectionInput[] = [];
    for (const item of originalItems) {
      const edit = edits[item.auditSessionItemId];
      if (!edit) continue;
      if (edit.removed) {
        corrections.push({
          auditSessionItemId: item.auditSessionItemId,
          changeType: "removed",
          requirementId: item.requirementId,
          subjectType: item.subjectType,
          subjectId: item.subjectId,
          previousFinding: item.originalFinding,
          previousNotes: item.originalNotes,
          newFinding: null,
          newNotes: null,
        });
        continue;
      }
      const notesChanged = (edit.notes.trim() || null) !== (item.originalNotes?.trim() || null);
      const findingChanged = edit.finding !== item.originalFinding;
      if (findingChanged || notesChanged) {
        corrections.push({
          auditSessionItemId: item.auditSessionItemId,
          changeType: "edited",
          requirementId: item.requirementId,
          subjectType: item.subjectType,
          subjectId: item.subjectId,
          previousFinding: item.originalFinding,
          previousNotes: item.originalNotes,
          newFinding: edit.finding,
          newNotes: edit.notes.trim() || null,
        });
      }
    }
    for (const addition of additions) {
      corrections.push({
        auditSessionItemId: null,
        changeType: "added",
        requirementId: addition.requirementId,
        subjectType: "workforce_member",
        subjectId: addition.subjectId,
        previousFinding: null,
        previousNotes: null,
        newFinding: addition.finding,
        newNotes: addition.notes.trim() || null,
      });
    }
    return corrections;
  }, [originalItems, edits, additions]);

  function describeChange(c: ItemCorrectionInput, requirementName: string, subjectLabel: string): string {
    if (c.changeType === "added") return `Added during correction: ${requirementName} for ${subjectLabel} — ${FINDING_LABELS[c.newFinding!]}`;
    if (c.changeType === "removed") return `Removed (entered in error): ${requirementName} for ${subjectLabel}`;
    const parts: string[] = [];
    if (c.previousFinding !== c.newFinding) parts.push(`Finding changed ${FINDING_LABELS[c.previousFinding!]} → ${FINDING_LABELS[c.newFinding!]}`);
    if ((c.previousNotes ?? "") !== (c.newNotes ?? "")) parts.push("Notes changed");
    return `${requirementName} for ${subjectLabel}: ${parts.join(", ")}`;
  }

  const requirementNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of originalItems) map.set(item.requirementId, item.requirementName);
    for (const a of additions) map.set(a.requirementId, a.requirementName);
    return map;
  }, [originalItems, additions]);
  const subjectLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of originalItems) map.set(item.subjectId, item.subjectLabel);
    for (const a of additions) map.set(a.subjectId, a.subjectLabel);
    return map;
  }, [originalItems, additions]);

  function handleLock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rationale.trim()) {
      setError("A correction rationale is required.");
      return;
    }
    startTransition(async () => {
      const res = await addAuditSessionCorrectionAction({ sessionId, rationale: rationale.trim(), itemCorrections });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(`/audit-readiness/drills/${sessionId}`);
    });
  }

  if (step === "review") {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Review Corrections</h2>
          {itemCorrections.length === 0 ? (
            <p className="mt-3 font-sans text-sm text-muted">No changes.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {itemCorrections.map((c, i) => (
                <li key={i} className="font-sans text-sm text-body">
                  {describeChange(c, requirementNameById.get(c.requirementId) ?? c.requirementId, subjectLabelById.get(c.subjectId) ?? c.subjectId)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={handleLock} className="rounded-xl border border-ivory-border bg-white p-5">
          <label className="block">
            <span className="font-sans text-sm font-medium text-body">Correction rationale</span>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              className="mt-1 w-full max-w-xl rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
            />
          </label>
          {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}
          <p className="mt-2 font-sans text-xs font-medium text-warning-text">
            This cannot be undone — the original audit stays preserved, but this correction becomes a permanent part
            of its history once locked.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={isPending || !rationale.trim()}
              className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Locking…" : "Complete Correction & Lock"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStep("edit")}
              className="rounded-lg border border-ivory-border px-4 py-2 font-sans text-sm font-medium text-muted hover:border-navy/20"
            >
              Back to Edit
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.subjectId} className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">{group.subjectLabel}</h2>
          <ul className="mt-3 divide-y divide-ivory-border">
            {group.rows.map((item) => {
              const edit = edits[item.auditSessionItemId];
              return (
                <li key={item.auditSessionItemId} className="py-3">
                  <p className="font-sans text-sm font-medium text-body">{item.requirementName}</p>
                  <div className={`mt-2 grid gap-2 sm:grid-cols-2 ${edit.removed ? "opacity-40" : ""}`}>
                    <label className="block">
                      <span className="font-sans text-[11px] font-medium text-muted">Finding</span>
                      <select
                        value={edit.finding}
                        disabled={edit.removed}
                        onChange={(e) => updateEdit(item.auditSessionItemId, { finding: e.target.value as AuditSessionItemFinding })}
                        className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                      >
                        {FINDING_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="font-sans text-[11px] font-medium text-muted">Notes</span>
                      <textarea
                        value={edit.notes}
                        disabled={edit.removed}
                        onChange={(e) => updateEdit(item.auditSessionItemId, { notes: e.target.value })}
                        rows={1}
                        className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="mt-2 flex items-center gap-2 font-sans text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={edit.removed}
                      onChange={(e) => updateEdit(item.auditSessionItemId, { removed: e.target.checked })}
                    />
                    Remove — this finding was recorded in error and should not have been part of the audit
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {additions.length > 0 && (
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Findings to add</h2>
          <ul className="mt-3 divide-y divide-ivory-border">
            {additions.map((a) => (
              <li key={a.key} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-sans text-sm font-medium text-body">
                    {a.requirementName} for {a.subjectLabel} <span className="font-sans text-xs text-warning-text">(will show as &quot;Added during correction&quot;)</span>
                  </p>
                  <button type="button" onClick={() => removeAddition(a.key)} className="font-sans text-xs font-medium text-red-600 hover:text-red-700">
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-sans text-[11px] font-medium text-muted">Finding</span>
                    <select
                      value={a.finding}
                      onChange={(e) =>
                        setAdditions((prev) => prev.map((x) => (x.key === a.key ? { ...x, finding: e.target.value as AuditSessionItemFinding } : x)))
                      }
                      className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                    >
                      {FINDING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="font-sans text-[11px] font-medium text-muted">Notes</span>
                    <textarea
                      value={a.notes}
                      onChange={(e) => setAdditions((prev) => prev.map((x) => (x.key === a.key ? { ...x, notes: e.target.value } : x)))}
                      rows={1}
                      className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Add a finding</h2>
        <p className="mt-1 font-sans text-xs text-muted">
          For a requirement that should have been reviewed but has no recorded finding — it will always show as
          &quot;Added during correction,&quot; never as part of the original audit.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="font-sans text-[11px] font-medium text-muted">Person</span>
            <select
              value={addSubjectId}
              onChange={(e) => {
                setAddSubjectId(e.target.value);
                setAddRequirementId("");
              }}
              className="mt-0.5 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            >
              <option value="">Select…</option>
              {addSubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-sans text-[11px] font-medium text-muted">Requirement</span>
            <select
              value={addRequirementId}
              onChange={(e) => setAddRequirementId(e.target.value)}
              disabled={!addSubjectId}
              className="mt-0.5 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none disabled:opacity-50"
            >
              <option value="">Select…</option>
              {addRequirementOptions.map((o) => (
                <option key={o.requirementId} value={o.requirementId}>
                  {o.requirementName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addFinding}
            disabled={!addSubjectId || !addRequirementId}
            className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setStep("review")}
          disabled={itemCorrections.length === 0}
          className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          Review Corrections
        </button>
      </div>
    </div>
  );
}
