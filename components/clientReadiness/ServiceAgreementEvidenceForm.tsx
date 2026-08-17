"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordServiceAgreementEvidenceAction } from "@/lib/actions/clientReadiness";
import { FileUploadField } from "@/components/ui/FileUploadField";
import { validateDocumentFile } from "@/lib/workforce/documentValidation";

// One upload, one document — optionally also satisfies Billing / Payment
// Authorization from the same document (Decision 7: never a duplicate
// upload merely because two cards exist).
export function ServiceAgreementEvidenceForm({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [alsoSatisfiesBilling, setAlsoSatisfiesBilling] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("A document is required.");
      return;
    }
    const validation = validateDocumentFile({ size: file.size, type: file.type, name: file.name });
    if (!validation.ok) {
      setError(validation.error ?? "That file can't be uploaded.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("residentId", residentId);
      formData.set("effectiveDate", effectiveDate);
      formData.set("alsoSatisfiesBilling", alsoSatisfiesBilling ? "true" : "false");
      if (notes.trim()) formData.set("notes", notes.trim());
      formData.set("file", file);

      const res = await recordServiceAgreementEvidenceAction(formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNotes("");
      setFile(null);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
      >
        Upload Service Agreement
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-80 space-y-2 rounded-lg border border-ivory-border bg-white p-3">
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Signed Date</span>
        <input
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          required
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <FileUploadField
        label="Service Agreement (PDF)"
        accept="application/pdf"
        required
        value={file}
        onChange={setFile}
        helpText="PDF only, up to 10 MB"
      />

      <label className="flex items-start gap-2 py-1">
        <input
          type="checkbox"
          checked={alsoSatisfiesBilling}
          onChange={(e) => setAlsoSatisfiesBilling(e.target.checked)}
          className="mt-0.5"
        />
        <span className="font-sans text-xs text-body">
          This document also includes the Billing / Payment Authorization terms — satisfy that requirement from the
          same document instead of a separate upload.
        </span>
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
  );
}
