import Link from "next/link";
import { ATTENTION_STATE_LABELS, ATTENTION_STATE_STYLES } from "@/components/workforce/WorkforceRosterTable";
import { summarizeByCategory } from "@/lib/workforce/categorySummary";
import type { AttentionEvaluation } from "@/lib/workforce/attentionState";
import type { RequirementSetEvaluation } from "@/lib/compliance/requirementSetStatus";
import type { WorkforceComplianceAction } from "@/lib/supabase/types";

// Level 2 — the Employee Summary itself. Exactly the shape the mission
// asks for: Overall / Attention State / Next Best Action / Outstanding
// Work / four category summaries. Every section here summarizes only —
// no evidence, no history, no per-requirement detail. Those live one click
// away, inside EmployeeRecordAuditSection's RequirementResolutionCards.
export function EmployeeSummaryPanel({
  attentionState,
  nextAction,
  openActionsCount,
  registry,
  workforceMemberId,
}: {
  attentionState: AttentionEvaluation;
  nextAction: WorkforceComplianceAction | null;
  openActionsCount: number;
  registry: RequirementSetEvaluation;
  workforceMemberId: string;
}) {
  const categories = summarizeByCategory(registry.requirements);

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-4 font-sans text-label font-semibold uppercase tracking-widest text-muted">Employee Summary</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Overall</p>
          <p className="mt-0.5 font-sans text-sm text-body">{attentionState.explanation}</p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Attention State</p>
          <span
            className={`mt-0.5 inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${ATTENTION_STATE_STYLES[attentionState.state]}`}
          >
            {ATTENTION_STATE_LABELS[attentionState.state]}
          </span>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Next Best Action</p>
          <p className="mt-0.5 font-sans text-sm text-body">{nextAction ? nextAction.title : "No action required"}</p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Outstanding Work</p>
          <p className="mt-0.5 font-sans text-sm text-body">
            {openActionsCount === 0
              ? "Nothing open."
              : `${openActionsCount} open ${openActionsCount === 1 ? "item" : "items"} — see Open Actions below.`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ivory-border pt-5 sm:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.category}
            href={`/workforce/${workforceMemberId}#employee-record-audit`}
            className="rounded-lg border border-ivory-border px-3 py-2.5 text-center hover:border-navy/20"
          >
            <p className="font-sans text-[11px] font-medium uppercase tracking-wide text-muted">{c.label}</p>
            <span
              className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[10px] font-medium ${ATTENTION_STATE_STYLES[c.worstState]}`}
            >
              {ATTENTION_STATE_LABELS[c.worstState]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
