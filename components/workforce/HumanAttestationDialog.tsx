"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitHumanAttestation } from "@/lib/actions/workforce";
import {
  ATTESTATION_RESULT_LABELS,
  AUTHORITATIVE_SOURCE_LABELS,
  VERIFICATION_METHOD_LABELS,
  getAttestationResultOptions,
} from "@/lib/workforce/humanAttestation";
import type { RequirementPlaybook } from "@/lib/workforce/requirementPlaybooks";
import type { AttestationResult, AuthoritativeSourceSystem, EvidenceVerificationMethod } from "@/lib/supabase/types";

// "Verify From Source" — the one entry point into Human Attestation. Named
// exactly that, deliberately: not Override, not Mark Complete, not Upload.
// An authorized person personally reviews an authoritative source and
// records that review here; the source stays the source of truth.
export function HumanAttestationDialog({
  workforceMemberId,
  requirementCode,
  currentEvidenceId,
  playbook,
}: {
  workforceMemberId: string;
  requirementCode: string;
  currentEvidenceId: string | null;
  playbook: RequirementPlaybook;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [authoritativeSourceSystem, setAuthoritativeSourceSystem] = useState<AuthoritativeSourceSystem>(
    playbook.defaultAuthoritativeSourceSystem
  );
  const [verificationMethod, setVerificationMethod] = useState<EvidenceVerificationMethod>(playbook.defaultVerificationMethod);
  const resultOptions = getAttestationResultOptions(requirementCode);
  const [attestationResult, setAttestationResult] = useState<AttestationResult>(resultOptions[0]);
  const [observedDate, setObservedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [externalReference, setExternalReference] = useState("");

  function handleSubmit(formData: FormData) {
    formData.set("workforceMemberId", workforceMemberId);
    formData.set("requirementCode", requirementCode);
    formData.set("currentEvidenceId", currentEvidenceId ?? "");
    formData.set("authoritativeSourceSystem", authoritativeSourceSystem);
    formData.set("verificationMethod", verificationMethod);
    formData.set("attestationResult", attestationResult);
    formData.set("observedDate", observedDate);
    formData.set("notes", notes);
    formData.set("externalReference", externalReference);

    setError(null);
    startTransition(async () => {
      const res = await submitHumanAttestation(formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
      >
        Verify From Source
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-lg border border-ivory-border bg-ivory-warm p-4">
      <p className="font-sans text-xs font-semibold uppercase tracking-widest text-subtle">Verify From Source</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Authoritative Source</span>
          <select
            value={authoritativeSourceSystem}
            onChange={(e) => setAuthoritativeSourceSystem(e.target.value as AuthoritativeSourceSystem)}
            className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          >
            {Object.entries(AUTHORITATIVE_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Verification Method</span>
          <select
            value={verificationMethod}
            onChange={(e) => setVerificationMethod(e.target.value as EvidenceVerificationMethod)}
            className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          >
            {Object.entries(VERIFICATION_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Result Observed</span>
          <select
            value={attestationResult}
            onChange={(e) => setAttestationResult(e.target.value as AttestationResult)}
            className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          >
            {resultOptions.map((value) => (
              <option key={value} value={value}>
                {ATTESTATION_RESULT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Observation Date</span>
          <input
            type="date"
            value={observedDate}
            onChange={(e) => setObservedDate(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
        </label>
      </div>

      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Notes (optional)</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else observed while reviewing the source"
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">External Reference (optional)</span>
          <input
            type="text"
            value={externalReference}
            onChange={(e) => setExternalReference(e.target.value)}
            placeholder="e.g. a case or confirmation number"
            className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Supporting Document (optional)</span>
          <input type="file" name="file" accept="application/pdf" className="mt-0.5 block w-full font-sans text-xs text-body" />
        </label>
      </div>

      <p className="font-sans text-[11px] text-subtle">
        Only your review of {AUTHORITATIVE_SOURCE_LABELS[authoritativeSourceSystem]} is recorded here — no unnecessary PHI or
        sensitive detail from the source should be copied into notes.
      </p>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          Record Verification
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ivory-border px-3.5 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
