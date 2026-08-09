import type { RecruitingLeadVendorIdentity } from "@/lib/supabase/types";
import { shortenVendorId } from "@/lib/recruiting/extractors/apploi/vendorIdentity";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const SOURCE_LABEL: Record<string, string> = { apploi: "Apploi", viventium: "Viventium" };

// Vendor identity linkage — kept visibly separate from operational
// observations. This answers "which vendor record is this Serve lead
// linked to, and was that link ever confirmed by a person?", never "what
// does that record currently show" (that's VendorEvidencePanel). Full
// vendor identifiers are never shown prominently — only a shortened form,
// consistent with the approved plan's display requirement.
export function VendorIdentityPanel({ identities }: { identities: RecruitingLeadVendorIdentity[] }) {
  if (identities.length === 0) {
    return (
      <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
        <h2 className="mb-1 font-serif text-card-title font-light text-body">Vendor Identity Links</h2>
        <p className="font-sans text-sm text-muted">No vendor identity has been linked to this lead yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h2 className="mb-1 font-serif text-card-title font-light text-body">Vendor Identity Links</h2>
      <p className="mb-3 font-sans text-xs text-subtle">
        Which vendor record this Serve lead is linked to — separate from what that record currently shows.
      </p>
      <div className="space-y-2">
        {identities.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 border-b border-ivory-border pb-1.5 text-sm">
            <div>
              <span className="font-sans text-body">{SOURCE_LABEL[v.source_system] ?? v.source_system}</span>
              {v.vendor_display_name && <span className="ml-2 font-sans text-xs text-subtle">“{v.vendor_display_name}”</span>}
            </div>
            <div className="flex items-center gap-2 font-sans text-[11px] text-muted">
              <span title={v.vendor_record_id}>Record: {shortenVendorId(v.vendor_record_id)}</span>
              <span>{v.match_method.replace(/_/g, " ")}</span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  v.is_human_confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {v.is_human_confirmed ? `Human confirmed${v.linked_by ? ` (${v.linked_by})` : ""}` : "Not yet confirmed"}
              </span>
              <span>{formatDate(v.linked_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
