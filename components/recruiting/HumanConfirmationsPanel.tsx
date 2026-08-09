import type { RecruitingLeadHumanConfirmation } from "@/lib/supabase/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Human Confirmed — the third, structurally distinct evidence class.
// Actor, timestamp, and rationale are always shown, never abbreviated
// away — a confirmation with no visible source is exactly what this
// system is designed never to produce or display as trustworthy.
export function HumanConfirmationsPanel({ confirmations }: { confirmations: RecruitingLeadHumanConfirmation[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Human Confirmations
        </h3>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
          Confirmed
        </span>
      </div>
      {confirmations.length === 0 ? (
        <p className="font-sans text-sm text-muted">No facts have been explicitly confirmed by a Serve team member yet.</p>
      ) : (
        <div className="space-y-2">
          {confirmations.map((c) => (
            <div key={c.id} className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-4 py-3">
              <p className="font-sans text-sm text-body">
                <span className="font-medium">{c.confirmation_key}:</span> {c.confirmed_value}
              </p>
              <p className="mt-1 font-sans text-xs text-muted">Rationale: {c.rationale}</p>
              <p className="mt-1 font-sans text-[11px] text-subtle">
                Confirmed by {c.actor} — {formatDate(c.confirmed_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
