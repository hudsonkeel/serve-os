"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideWorkforceProfileDiscrepancy,
  lockWorkforceProfile,
  reviewWorkforceProfile,
  saveWorkforceCanonicalProfile,
  unlockWorkforceProfile,
} from "@/lib/actions/workforce";
import type { PersonVendorIdentityLink, WorkforceCanonicalProfileStatus, WorkforceMember, WorkforceProfileDiscrepancy } from "@/lib/supabase/types";

const STATUS_LABELS: Record<WorkforceCanonicalProfileStatus, string> = {
  unreviewed: "Unreviewed",
  reviewed: "Reviewed",
  needs_review: "Needs Review",
  locked: "Locked",
};

const STATUS_STYLES: Record<WorkforceCanonicalProfileStatus, string> = {
  unreviewed: "bg-ivory-warm text-muted",
  reviewed: "bg-emerald-50 text-emerald-700",
  needs_review: "bg-amber-50 text-amber-700",
  locked: "bg-red-50 text-red-700",
};

interface AxisCareIdentityFields {
  firstName?: string | null;
  lastName?: string | null;
  goesBy?: string | null;
  personalEmail?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">{label}</p>
      <p className="mt-0.5 font-sans text-base text-body">{value || "—"}</p>
    </div>
  );
}

function SourceDifference({ label, canonical, source }: { label: string; canonical: string | null; source: string | null | undefined }) {
  if (!source || !source.trim()) return null;
  const differs = (canonical ?? "").trim().toLowerCase() !== source.trim().toLowerCase();
  if (!differs) return null;
  return (
    <p className="mt-1 font-sans text-xs text-amber-700">
      AxisCare source {label}: <span className="font-medium">{source}</span> — difference detected
    </p>
  );
}

export function CanonicalProfileCard({
  workforceMemberId,
  member,
  primaryVendorIdentity,
  openDiscrepancies,
  canEdit,
  canEditLegalIdentity,
}: {
  workforceMemberId: string;
  member: WorkforceMember;
  primaryVendorIdentity: PersonVendorIdentityLink | null;
  openDiscrepancies: WorkforceProfileDiscrepancy[];
  canEdit: boolean;
  canEditLegalIdentity: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [statusAction, setStatusAction] = useState<"idle" | "review" | "lock" | "unlock">("idle");
  const [statusRationale, setStatusRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [form, setForm] = useState({
    legalFirstName: member.legal_first_name ?? "",
    legalMiddleName: member.legal_middle_name ?? "",
    legalLastName: member.legal_last_name ?? "",
    preferredName: member.preferred_name ?? "",
    displayName: member.display_name ?? "",
    primaryEmail: member.primary_email ?? "",
    primaryPhone: member.primary_phone ?? "",
    rationale: "",
  });

  const sourceData = (primaryVendorIdentity?.approved_source_data ?? {}) as AxisCareIdentityFields;
  const legalNameLine = [member.legal_first_name, member.legal_middle_name, member.legal_last_name].filter(Boolean).join(" ");
  const isLocked = member.canonical_profile_status === "locked";

  function runSave() {
    const legalChanged =
      form.legalFirstName.trim() !== (member.legal_first_name ?? "") ||
      form.legalMiddleName.trim() !== (member.legal_middle_name ?? "") ||
      form.legalLastName.trim() !== (member.legal_last_name ?? "");
    const requiresRationale = legalChanged || member.canonical_profile_status === "reviewed" || member.canonical_profile_status === "needs_review";
    if (requiresRationale && !form.rationale.trim()) {
      setError("A rationale is required to change a legal-identity field or edit a reviewed profile.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveWorkforceCanonicalProfile({
        workforceMemberId,
        legalFirstName: form.legalFirstName.trim() || null,
        legalMiddleName: form.legalMiddleName.trim() || null,
        legalLastName: form.legalLastName.trim() || null,
        preferredName: form.preferredName.trim() || null,
        displayName: form.displayName.trim() || null,
        primaryEmail: form.primaryEmail.trim() || null,
        primaryPhone: form.primaryPhone.trim() || null,
        rationale: form.rationale.trim() || null,
      });
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function runStatusAction(action: "review" | "lock" | "unlock") {
    if (!statusRationale.trim()) {
      setError("A rationale is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fn = action === "review" ? reviewWorkforceProfile : action === "lock" ? lockWorkforceProfile : unlockWorkforceProfile;
      const result = await fn({ workforceMemberId, rationale: statusRationale });
      if (result.error) setError(result.error);
      else {
        setStatusAction("idle");
        setStatusRationale("");
        router.refresh();
      }
    });
  }

  function runDiscrepancyDecision(discrepancyId: string, resolution: "accepted_source" | "retained_canonical") {
    const rationale = window.prompt(`Rationale for this decision (required):`);
    if (!rationale || !rationale.trim()) return;
    startTransition(async () => {
      const result = await decideWorkforceProfileDiscrepancy({ discrepancyId, workforceMemberId, resolution, rationale });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">Serve Canonical Profile</h3>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${STATUS_STYLES[member.canonical_profile_status]}`}>
            {STATUS_LABELS[member.canonical_profile_status]}
          </span>
          {canEdit && !editing && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEditing(true)}
              className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20 disabled:opacity-50"
            >
              Edit Serve Profile
            </button>
          )}
        </div>
      </div>

      {openDiscrepancies.length > 0 && (
        <div className="mb-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="font-sans text-xs font-semibold text-amber-800">Source discrepancies awaiting review</p>
          {openDiscrepancies.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 font-sans text-xs text-amber-800">
              <span>
                <span className="font-medium">{d.field_name.replace(/_/g, " ")}</span>: Serve has &quot;{d.canonical_value ?? "—"}&quot;, AxisCare
                now shows &quot;{d.source_value ?? "—"}&quot;
              </span>
              {canEditLegalIdentity && (
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runDiscrepancyDecision(d.id, "accepted_source")}
                    className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100"
                  >
                    Accept AxisCare value
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runDiscrepancyDecision(d.id, "retained_canonical")}
                    className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100"
                  >
                    Keep Serve value
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-3 font-sans text-xs text-red-600">{error}</p>}

      {!editing ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Field label="Display Name" value={member.display_name} />
            <SourceDifference label="name" canonical={member.display_name} source={[sourceData.firstName, sourceData.lastName].filter(Boolean).join(" ")} />
          </div>
          <Field label="Legal Name" value={legalNameLine} />
          <Field label="Preferred Name" value={member.preferred_name ?? ""} />
          <div>
            <Field label="Primary Email" value={member.primary_email ?? ""} />
            <SourceDifference label="email" canonical={member.primary_email} source={sourceData.personalEmail} />
          </div>
          <div>
            <Field label="Primary Phone" value={member.primary_phone ?? ""} />
            <SourceDifference label="phone" canonical={member.primary_phone} source={sourceData.mobilePhone ?? sourceData.homePhone} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-muted">
              Legal first name
              <input
                type="text"
                value={form.legalFirstName}
                disabled={!canEditLegalIdentity}
                onChange={(e) => setForm({ ...form, legalFirstName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none disabled:bg-ivory-warm"
              />
            </label>
            <label className="text-xs text-muted">
              Legal middle name
              <input
                type="text"
                value={form.legalMiddleName}
                disabled={!canEditLegalIdentity}
                onChange={(e) => setForm({ ...form, legalMiddleName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none disabled:bg-ivory-warm"
              />
            </label>
            <label className="text-xs text-muted">
              Legal last name
              <input
                type="text"
                value={form.legalLastName}
                disabled={!canEditLegalIdentity}
                onChange={(e) => setForm({ ...form, legalLastName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none disabled:bg-ivory-warm"
              />
            </label>
          </div>
          {!canEditLegalIdentity && (
            <p className="font-sans text-xs text-subtle">Only an admin can change legal name — ask an admin for a correction.</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-muted">
              Preferred name
              <input
                type="text"
                value={form.preferredName}
                onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
            <label className="text-xs text-muted">
              Display name
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Primary email
              <input
                type="email"
                value={form.primaryEmail}
                onChange={(e) => setForm({ ...form, primaryEmail: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
            <label className="text-xs text-muted">
              Primary phone
              <input
                type="tel"
                value={form.primaryPhone}
                onChange={(e) => setForm({ ...form, primaryPhone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
          </div>
          <label className="block text-xs text-muted">
            Rationale for change
            <input
              type="text"
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              placeholder="Required for legal name or a reviewed profile"
              className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={runSave}
              className="rounded-lg bg-navy px-4 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-ivory-border px-4 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {canEditLegalIdentity && (
        <div className="mt-4 border-t border-ivory-border pt-3">
          {statusAction === "idle" ? (
            <div className="flex gap-2">
              {(member.canonical_profile_status === "unreviewed" || member.canonical_profile_status === "needs_review") && (
                <button
                  type="button"
                  onClick={() => setStatusAction("review")}
                  className="rounded-lg border border-emerald-300 px-3 py-1.5 font-sans text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Mark Reviewed
                </button>
              )}
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => setStatusAction("lock")}
                  className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
                >
                  Lock Profile
                </button>
              )}
              {isLocked && (
                <button
                  type="button"
                  onClick={() => setStatusAction("unlock")}
                  className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
                >
                  Unlock Profile
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={statusRationale}
                onChange={(e) => setStatusRationale(e.target.value)}
                placeholder="Rationale (required)"
                className="w-72 rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => runStatusAction(statusAction)}
                className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                Confirm {statusAction}
              </button>
              <button type="button" onClick={() => setStatusAction("idle")} className="font-sans text-xs text-muted hover:text-body">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
