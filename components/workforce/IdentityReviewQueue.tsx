"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmWorkforceIdentityLink,
  deferWorkforceIdentityLink,
  linkWorkforceIdentityAsSecondaryRecord,
  rejectWorkforceIdentityLink,
} from "@/lib/actions/workforce";
import type { LinkRole, PersonVendorIdentityLink } from "@/lib/supabase/types";

export interface IdentityReviewDuplicateCandidate {
  linkId: string;
  vendorRecordId: string;
  displayName: string | null;
  workforceMemberId: string | null;
}

export interface IdentityReviewRow {
  link: PersonVendorIdentityLink;
  candidateDisplayName: string | null;
  // Other AxisCare records with a matching normalized name/email/phone —
  // requirement 4's "duplicate-aware identity review." Never auto-linked.
  duplicateCandidates: IdentityReviewDuplicateCandidate[];
  // Requirement 5's pre-rejection warning — recommends reviewing both
  // records together, never blocks the rejection itself.
  rejectionWarning: { shouldWarn: boolean; reasons: string[] };
}

export interface WorkforceRosterOption {
  workforceMemberId: string;
  displayName: string;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-700",
};

interface AxisCareIdentityFields {
  statusActive?: boolean | null;
  statusLabel?: string | null;
  classes?: Array<{ code: string | null; label: string | null }>;
  hireDate?: string | null;
  startDate?: string | null;
  terminationDate?: string | null;
  personalEmail?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-subtle">{label}</span>
      <p className="font-sans text-xs text-body">{value}</p>
    </div>
  );
}

function IdentityReviewRowView({ row, rosterOptions }: { row: IdentityReviewRow; rosterOptions: WorkforceRosterOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [rationale, setRationale] = useState("");
  const [mode, setMode] = useState<"idle" | "reject" | "defer" | "link_secondary">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmRejectAnyway, setConfirmRejectAnyway] = useState(false);
  const [secondaryTargetId, setSecondaryTargetId] = useState("");
  const [secondaryRole, setSecondaryRole] = useState<Exclude<LinkRole, "primary">>("duplicate");
  const router = useRouter();

  const { link, candidateDisplayName, duplicateCandidates, rejectionWarning } = row;
  const sourceData = (link.approved_source_data ?? {}) as AxisCareIdentityFields;

  function runConfirm(mode: "existing" | "new_profile") {
    setError(null);
    startTransition(async () => {
      const result = await confirmWorkforceIdentityLink(
        mode === "existing" && link.subject_id
          ? { linkId: link.id, mode: "existing", subjectId: link.subject_id }
          : { linkId: link.id, mode: "new_profile" }
      );
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function runReject() {
    if (!rationale.trim()) {
      setError("A rationale is required to reject this link.");
      return;
    }
    if (rejectionWarning.shouldWarn && !confirmRejectAnyway) {
      setError("Review the duplicate warning below, then confirm rejection again if this is correct.");
      setConfirmRejectAnyway(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rejectWorkforceIdentityLink({ linkId: link.id, rationale });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function runDefer() {
    if (!rationale.trim()) {
      setError("A rationale is required to defer this link.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deferWorkforceIdentityLink({ linkId: link.id, rationale });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function runLinkSecondary() {
    if (!secondaryTargetId) {
      setError("Select the workforce member this record belongs to.");
      return;
    }
    if (!rationale.trim()) {
      setError("A rationale is required to link this record as duplicate or retired.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await linkWorkforceIdentityAsSecondaryRecord({
        linkId: link.id,
        workforceMemberId: secondaryTargetId,
        linkRole: secondaryRole,
        rationale,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-sans text-sm font-medium text-body">
            AxisCare: {link.vendor_display_name ?? link.vendor_record_id}
          </p>
          <p className="mt-0.5 font-sans text-xs text-muted">
            {candidateDisplayName ? `Proposed match: ${candidateDisplayName}` : "No existing match found — propose new profile"}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${
            CONFIDENCE_STYLES[link.match_confidence] ?? "bg-ivory-warm text-muted"
          }`}
        >
          {link.match_method.replace(/_/g, " ")} · {link.match_confidence} confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-ivory-warm/60 p-3 sm:grid-cols-4">
        <Detail label="AxisCare record ID" value={link.vendor_record_id} />
        <Detail label="Status" value={sourceData.statusLabel ?? (sourceData.statusActive ? "Active" : "Inactive")} />
        <Detail label="Hire date" value={sourceData.hireDate ?? "—"} />
        <Detail label="Start date" value={sourceData.startDate ?? "—"} />
        <Detail label="Termination date" value={sourceData.terminationDate ?? "—"} />
        <Detail label="Email" value={sourceData.personalEmail ?? "—"} />
        <Detail label="Phone" value={sourceData.mobilePhone ?? sourceData.homePhone ?? "—"} />
        <Detail
          label="Classes"
          value={sourceData.classes && sourceData.classes.length > 0
            ? sourceData.classes.map((c) => c.label ?? c.code).filter(Boolean).join(", ")
            : "—"}
        />
        <Detail label="Last synchronized" value={link.last_synced_at ? new Date(link.last_synced_at).toLocaleString() : "Never"} />
      </div>

      {duplicateCandidates.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="font-sans text-xs font-semibold text-amber-800">
            Other AxisCare records with a matching name, email, or phone:
          </p>
          <ul className="mt-1 space-y-0.5">
            {duplicateCandidates.map((c) => (
              <li key={c.linkId} className="font-sans text-xs text-amber-800">
                {c.displayName ?? c.vendorRecordId} ({c.vendorRecordId})
                {c.workforceMemberId ? " — already linked" : " — not yet reviewed"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      {mode === "reject" && confirmRejectAnyway && rejectionWarning.shouldWarn && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="font-sans text-xs font-semibold text-red-700">
            This may be the same person as another AxisCare record — recommend reviewing both together before rejecting:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {rejectionWarning.reasons.map((reason) => (
              <li key={reason} className="font-sans text-xs text-red-700">{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {link.subject_id && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runConfirm("existing")}
            className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
          >
            Link as primary AxisCare identity
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => runConfirm("new_profile")}
          className="rounded-lg border border-navy/30 px-3.5 py-1.5 font-sans text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-50"
        >
          Create new workforce person
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setMode(mode === "link_secondary" ? "idle" : "link_secondary")}
          className="rounded-lg border border-ivory-border px-3.5 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          Link as duplicate/retired
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setMode(mode === "reject" ? "idle" : "reject");
            setConfirmRejectAnyway(false);
          }}
          className="rounded-lg border border-ivory-border px-3.5 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          Not the same person
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setMode(mode === "defer" ? "idle" : "defer")}
          className="rounded-lg border border-ivory-border px-3.5 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          Defer
        </button>
      </div>

      {(mode === "reject" || mode === "defer") && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Rationale (required)"
            className="w-80 rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={mode === "reject" ? runReject : runDefer}
            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
          >
            Confirm {mode === "reject" ? "not the same person" : "defer"}
          </button>
        </div>
      )}

      {mode === "link_secondary" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ivory-border p-3">
          <select
            value={secondaryTargetId}
            onChange={(e) => setSecondaryTargetId(e.target.value)}
            className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          >
            <option value="">Select workforce member…</option>
            {rosterOptions.map((option) => (
              <option key={option.workforceMemberId} value={option.workforceMemberId}>
                {option.displayName}
              </option>
            ))}
          </select>
          <select
            value={secondaryRole}
            onChange={(e) => setSecondaryRole(e.target.value as Exclude<LinkRole, "primary">)}
            className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          >
            <option value="duplicate">Duplicate</option>
            <option value="retired">Retired</option>
          </select>
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
            onClick={runLinkSecondary}
            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
          >
            Link record
          </button>
        </div>
      )}
    </div>
  );
}

export function IdentityReviewQueue({ rows, rosterOptions }: { rows: IdentityReviewRow[]; rosterOptions: WorkforceRosterOption[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
        <p className="font-serif text-xl text-muted">No identity links awaiting review</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ivory-border rounded-xl border border-ivory-border bg-surface shadow-card">
      {rows.map((row) => (
        <IdentityReviewRowView key={row.link.id} row={row} rosterOptions={rosterOptions} />
      ))}
    </div>
  );
}
