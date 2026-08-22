"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteWorkforceIdentityLinkToPrimary, setWorkforceIdentityLinkRole } from "@/lib/actions/workforce";
import type { LinkRole, PersonVendorIdentityLink } from "@/lib/supabase/types";

const ROLE_LABELS: Record<LinkRole, string> = {
  primary: "Primary",
  duplicate: "Duplicate",
  retired: "Retired",
  historical: "Historical",
  concurrent: "Concurrent",
};

const ROLE_STYLES: Record<LinkRole, string> = {
  primary: "bg-emerald-50 text-emerald-700",
  duplicate: "bg-amber-50 text-amber-700",
  retired: "bg-ivory-warm text-muted",
  historical: "bg-ivory-warm text-subtle",
  concurrent: "bg-blue-pale text-blue",
};

interface AxisCareIdentityFields {
  statusActive?: boolean | null;
  statusLabel?: string | null;
  hireDate?: string | null;
  startDate?: string | null;
  terminationDate?: string | null;
  personalEmail?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
}

function SourceIdentityCard({ link, canCorrect }: { link: PersonVendorIdentityLink; canCorrect: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "promote" | "retire">("idle");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const sourceData = (link.approved_source_data ?? {}) as AxisCareIdentityFields;
  const role = link.link_role ?? "historical";

  function runPromote() {
    if (!rationale.trim()) {
      setError("A rationale is required to promote this record to primary.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await promoteWorkforceIdentityLinkToPrimary({ linkId: link.id, rationale });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function runRetire() {
    if (!rationale.trim()) {
      setError("A rationale is required to retire this record.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setWorkforceIdentityLinkRole({ linkId: link.id, newRole: "retired", rationale });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-ivory-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-sans text-sm font-medium text-body">
            {link.vendor_display_name ?? link.vendor_record_id}
          </p>
          <p className="font-sans text-xs text-muted">AxisCare record {link.vendor_record_id}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${ROLE_STYLES[role]}`}>
          {ROLE_LABELS[role]}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <Detail label="Status" value={sourceData.statusLabel ?? (sourceData.statusActive ? "Active" : "Inactive")} />
        <Detail label="Termination date" value={sourceData.terminationDate ?? "—"} />
        <Detail label="Last synchronized" value={link.last_synced_at ? new Date(link.last_synced_at).toLocaleDateString() : "Never"} />
      </div>

      {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}

      {canCorrect && (
        <div className="mt-3">
          {mode === "idle" && role !== "primary" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("promote")}
                className="rounded-lg border border-navy/30 px-3 py-1 font-sans text-xs font-medium text-navy hover:bg-navy/5"
              >
                Promote to primary
              </button>
              {role !== "retired" && (
                <button
                  type="button"
                  onClick={() => setMode("retire")}
                  className="rounded-lg border border-ivory-border px-3 py-1 font-sans text-xs font-medium text-muted hover:border-navy/20"
                >
                  Retire
                </button>
              )}
            </div>
          )}
          {(mode === "promote" || mode === "retire") && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Rationale (required)"
                className="w-64 rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={mode === "promote" ? runPromote : runRetire}
                className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                Confirm {mode}
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="font-sans text-xs text-muted hover:text-body"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-subtle">{label}</span>
      <p className="font-sans text-xs text-body">{value}</p>
    </div>
  );
}

// Every confirmed AxisCare identity for this workforce member — primary,
// duplicate, retired, and (reserved, not yet assigned) historical. None is
// ever deleted or merged; duplicate/retired records stay visible here with
// their preserved approved_source_data. See
// supabase/migrations/20260811000000_add_vendor_identity_lineage.sql.
export function SourceIdentitiesSection({
  identities,
  canCorrect,
}: {
  identities: PersonVendorIdentityLink[];
  canCorrect: boolean;
}) {
  if (identities.length === 0) {
    return <p className="font-sans text-sm text-muted">Not yet linked to an AxisCare caregiver record.</p>;
  }

  const sorted = [...identities].sort((a, b) => {
    if (a.link_role === "primary") return -1;
    if (b.link_role === "primary") return 1;
    return 0;
  });

  return (
    <div className="space-y-3">
      {sorted.map((link) => (
        <SourceIdentityCard key={link.id} link={link} canCorrect={canCorrect} />
      ))}
    </div>
  );
}
