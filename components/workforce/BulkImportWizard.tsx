"use client";

import { useState } from "react";
import { uploadWorkforceDocument } from "@/lib/actions/workforce";
import { parseBulkImportFilename } from "@/lib/workforce/filenameParsing";

interface RosterOption {
  workforceMemberId: string;
  displayName: string;
}

interface ImportRow {
  file: File;
  suggestedCaregiverName: string | null;
  suggestedDocumentType: "nar_search" | "emr_search" | null;
  suggestedDate: string | null;
  // Human-confirmed selections — never auto-applied from the suggestion.
  workforceMemberId: string;
  requirementCode: "TX_NAR_SEARCH" | "TX_EMR_SEARCH" | "";
  documentDate: string;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

const DOCUMENT_TYPE_TO_REQUIREMENT: Record<"nar_search" | "emr_search", "TX_NAR_SEARCH" | "TX_EMR_SEARCH"> = {
  nar_search: "TX_NAR_SEARCH",
  emr_search: "TX_EMR_SEARCH",
};

export function BulkImportWizard({ roster }: { roster: RosterOption[] }) {
  const [rows, setRows] = useState<ImportRow[]>([]);

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const newRows: ImportRow[] = Array.from(files).map((file) => {
      const parsed = parseBulkImportFilename(file.name);
      const suggestedMatch = parsed.suggestedCaregiverName
        ? roster.find((r) => r.displayName.toLowerCase() === parsed.suggestedCaregiverName!.toLowerCase())
        : undefined;
      return {
        file,
        suggestedCaregiverName: parsed.suggestedCaregiverName,
        suggestedDocumentType: parsed.suggestedDocumentType,
        suggestedDate: parsed.suggestedDate,
        workforceMemberId: suggestedMatch?.workforceMemberId ?? "",
        requirementCode: parsed.suggestedDocumentType ? DOCUMENT_TYPE_TO_REQUIREMENT[parsed.suggestedDocumentType] : "",
        documentDate: parsed.suggestedDate ?? "",
        status: "pending",
      };
    });
    setRows((prev) => [...prev, ...newRows]);
  }

  function updateRow(index: number, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function uploadRow(index: number) {
    const row = rows[index];
    if (!row.workforceMemberId || !row.requirementCode) {
      updateRow(index, { status: "error", error: "Select a caregiver and document type before uploading." });
      return;
    }

    updateRow(index, { status: "uploading", error: undefined });

    const formData = new FormData();
    formData.set("workforceMemberId", row.workforceMemberId);
    formData.set("requirementCode", row.requirementCode);
    formData.set("documentType", row.requirementCode.toLowerCase());
    if (row.documentDate) formData.set("documentDate", row.documentDate);
    formData.set("file", row.file);

    const result = await uploadWorkforceDocument(formData);
    if (result.error) {
      updateRow(index, { status: "error", error: result.error });
    } else {
      updateRow(index, { status: "success" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-ivory-border bg-ivory p-6 text-center">
        <label className="cursor-pointer font-sans text-sm font-medium text-navy hover:underline">
          Select PDF files
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        </label>
        <p className="mt-1 font-sans text-xs text-muted">
          Filename is only ever a suggestion — confirm caregiver and document type before uploading.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="divide-y divide-ivory-border rounded-xl border border-ivory-border bg-surface shadow-card">
          {rows.map((row, index) => (
            <div key={`${row.file.name}-${index}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-[220px]">
                <p className="font-sans text-sm text-body">{row.file.name}</p>
                {row.suggestedCaregiverName && (
                  <p className="font-sans text-xs text-muted">Suggested: {row.suggestedCaregiverName}</p>
                )}
              </div>

              <select
                value={row.workforceMemberId}
                onChange={(e) => updateRow(index, { workforceMemberId: e.target.value })}
                disabled={row.status === "uploading" || row.status === "success"}
                className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              >
                <option value="">Select caregiver…</option>
                {roster.map((r) => (
                  <option key={r.workforceMemberId} value={r.workforceMemberId}>
                    {r.displayName}
                  </option>
                ))}
              </select>

              <select
                value={row.requirementCode}
                onChange={(e) => updateRow(index, { requirementCode: e.target.value as ImportRow["requirementCode"] })}
                disabled={row.status === "uploading" || row.status === "success"}
                className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              >
                <option value="">Document type…</option>
                <option value="TX_NAR_SEARCH">NAR</option>
                <option value="TX_EMR_SEARCH">EMR</option>
              </select>

              <input
                type="date"
                value={row.documentDate}
                onChange={(e) => updateRow(index, { documentDate: e.target.value })}
                disabled={row.status === "uploading" || row.status === "success"}
                className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />

              {row.status === "success" ? (
                <span className="font-sans text-xs font-medium text-emerald-700">Uploaded</span>
              ) : (
                <button
                  type="button"
                  disabled={row.status === "uploading"}
                  onClick={() => uploadRow(index)}
                  className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
                >
                  {row.status === "uploading" ? "Uploading…" : row.status === "error" ? "Retry" : "Upload"}
                </button>
              )}

              {row.error && <p className="w-full font-sans text-xs text-red-600">{row.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
