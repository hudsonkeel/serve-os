"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordTriageClassificationAction } from "@/lib/actions/clientReadiness";
import { TRIAGE_LEVEL_CODES, TRIAGE_LEVEL_LABELS, type TriageLevelCode } from "@/lib/clientReadiness/triageClassification";
import type { TriageClassificationDetail } from "@/lib/clientReadiness/triageClassificationDetail";
import type { ResidentTriageClassification } from "@/lib/data/residentTriageClassifications";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Current-state summary above the recording form — one of the 7 states
// buildTriageClassificationDetail() computes. A recognized AxisCare value
// is always shown even when Serve hasn't recorded anything yet (never
// leave this blank when there's something real to show); a legacy/
// unrecognized AxisCare value is always labeled as such, never silently
// dropped and never presented as if it were a real Priority level.
function CurrentStateSummary({ detail }: { detail: TriageClassificationDetail }) {
  switch (detail.state) {
    case "no_data":
      return <p className="font-sans text-sm text-muted">No triage classification is on file yet.</p>;

    case "axiscare_only_recognized":
      return (
        <p className="font-sans text-sm text-body">
          AxisCare: <span className="font-semibold">{detail.axiscare!.rawDescription}</span>. Not yet recorded in Serve.
        </p>
      );

    case "axiscare_only_unrecognized":
      return (
        <div className="space-y-1">
          <p className="font-sans text-sm text-body">Not yet recorded in Serve.</p>
          <p className="font-sans text-xs text-muted">
            AxisCare has a legacy/unrecognized triage value on file (&ldquo;{detail.axiscare!.rawDescription}&rdquo;) — not one of
            Serve&rsquo;s three classification levels.
          </p>
        </div>
      );

    case "serve_only":
      return (
        <p className="font-sans text-sm text-body">
          Serve: <span className="font-semibold">{detail.serve!.label}</span>
        </p>
      );

    case "agree":
      return (
        <p className="font-sans text-sm text-body">
          <span className="font-semibold">{detail.serve!.label}</span>{" "}
          <span className="text-success-text">— matches AxisCare</span>
        </p>
      );

    case "disagree":
      return (
        <div className="rounded-lg border border-amber-200 bg-warning-surface p-3">
          <p className="font-sans text-sm font-semibold uppercase tracking-wide text-warning-text">Triage classification needs review</p>
          <p className="mt-1 font-sans text-sm text-body">
            Serve: <span className="font-semibold">{detail.serve!.label}</span>
          </p>
          <p className="mt-0.5 font-sans text-sm text-body">
            AxisCare: <span className="font-semibold">{detail.axiscare!.rawDescription}</span>
          </p>
          <p className="mt-1 font-sans text-xs text-muted">Serve&rsquo;s recorded value governs until reviewed.</p>
        </div>
      );

    case "serve_with_unrecognized_axiscare":
      return (
        <div className="space-y-1">
          <p className="font-sans text-sm text-body">
            Serve: <span className="font-semibold">{detail.serve!.label}</span>
          </p>
          <p className="font-sans text-xs text-muted">
            AxisCare has a legacy/unrecognized triage value on file (&ldquo;{detail.axiscare!.rawDescription}&rdquo;) — not treated
            as a conflict.
          </p>
        </div>
      );
  }
}

function TriageHistoryList({ history }: { history: ResidentTriageClassification[] }) {
  if (history.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">History</p>
      <div className="space-y-2">
        {history.map((row) => (
          <div key={row.id} className="rounded-lg border border-ivory-border bg-ivory px-3 py-2">
            <p className="font-sans text-sm text-body">{TRIAGE_LEVEL_LABELS[row.levelCode]}</p>
            <p className="mt-0.5 font-sans text-xs text-subtle">
              Effective {compactDate(row.effectiveDate)} · Recorded by {row.actor} · {compactDate(row.createdAt)}
            </p>
            {row.notes && <p className="mt-1 font-sans text-xs text-muted">{row.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TriageClassificationControl({
  residentId,
  triageDetail,
  triageHistory,
}: {
  residentId: string;
  triageDetail: TriageClassificationDetail;
  triageHistory: ResidentTriageClassification[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [levelCode, setLevelCode] = useState<TriageLevelCode>(triageDetail.serve?.code ?? "P1");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await recordTriageClassificationAction({
        residentId,
        levelCode,
        effectiveDate,
        notes: notes.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNotes("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <CurrentStateSummary detail={triageDetail} />

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
        >
          Record Triage Classification
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="w-80 space-y-2 rounded-lg border border-ivory-border bg-white p-3">
          <label className="block">
            <span className="font-sans text-[11px] font-medium text-muted">Classification</span>
            <select
              value={levelCode}
              onChange={(e) => setLevelCode(e.target.value as TriageLevelCode)}
              className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            >
              {TRIAGE_LEVEL_CODES.map((code) => (
                <option key={code} value={code}>
                  {TRIAGE_LEVEL_LABELS[code]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-sans text-[11px] font-medium text-muted">Effective Date</span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              required
              className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="font-sans text-[11px] font-medium text-muted">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            />
          </label>

          {error && <p className="font-sans text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <TriageHistoryList history={triageHistory} />
    </div>
  );
}
