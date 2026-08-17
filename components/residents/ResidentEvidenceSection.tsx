"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getResidentDocumentDownloadUrl,
  supersedeResidentDocument,
  uploadResidentDocument,
} from "@/lib/actions/residentEvidence";
import { FileUploadField } from "@/components/ui/FileUploadField";
import type { PersonDocument, PersonEvidence } from "@/lib/supabase/types";

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Deliberately not the requirement-playbook-driven UI workforce uses
// (RequirementResolutionCard.tsx) — no resident-facing requirement is
// seeded yet (see lib/actions/residentEvidence.ts's header), so this is a
// plain document repository today: upload, list, download, replace. The
// moment a resident requirement exists, evidenceForDocument() below
// starts surfacing real verification status without any redesign here.
function evidenceForDocument(evidence: readonly PersonEvidence[], documentId: string): PersonEvidence | null {
  return evidence.find((e) => e.document_id === documentId) ?? null;
}

function DocumentRow({
  document,
  evidence,
  residentId,
  onReplaced,
}: {
  document: PersonDocument;
  evidence: PersonEvidence | null;
  residentId: string;
  onReplaced: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isReplacing, setIsReplacing] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setError(null);
    startTransition(async () => {
      const result = await getResidentDocumentDownloadUrl({ residentId, documentId: document.id });
      if (result.error || !result.url) {
        setError(result.error ?? "Could not open document.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function handleReplaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!replacementFile) {
      setError("Choose a replacement file first.");
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.set("residentId", residentId);
    formData.set("oldDocumentId", document.id);
    formData.set("documentType", document.document_type);
    formData.set("file", replacementFile);

    startTransition(async () => {
      const result = await supersedeResidentDocument(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsReplacing(false);
      setReplacementFile(null);
      onReplaced();
    });
  }

  const isSuperseded = document.status === "superseded";

  return (
    <li className="border-b border-ivory-border py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-sans text-sm font-medium text-body">{document.original_filename}</p>
          <p className="mt-0.5 font-sans text-xs text-muted">
            {document.document_type.replace(/_/g, " ")} · {formatDate(document.document_date ?? document.uploaded_at)} ·{" "}
            {document.uploaded_by}
            {isSuperseded && " · Replaced"}
            {evidence && ` · Linked to ${evidence.requirement_id ? "a requirement" : "no requirement"}`}
          </p>
        </div>
        {!isSuperseded && (
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={handleOpen}
              disabled={isPending}
              className="font-sans text-xs font-medium text-navy hover:text-navy-light disabled:opacity-60"
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setIsReplacing((v) => !v)}
              disabled={isPending}
              className="font-sans text-xs font-medium text-muted hover:text-body disabled:opacity-60"
            >
              Replace
            </button>
          </div>
        )}
      </div>

      {isReplacing && (
        <form onSubmit={handleReplaceSubmit} className="mt-3 flex items-center gap-3">
          <FileUploadField accept="application/pdf" value={replacementFile} onChange={setReplacementFile} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-navy px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Uploading…" : "Upload Replacement"}
          </button>
        </form>
      )}

      {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}
    </li>
  );
}

interface ResidentEvidenceSectionProps {
  residentId: string;
  canManage: boolean;
  documents: PersonDocument[];
  evidence: PersonEvidence[];
}

export function ResidentEvidenceSection({ residentId, canManage, documents, evidence }: ResidentEvidenceSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentType.trim()) {
      setError("Document type is required.");
      return;
    }
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.set("residentId", residentId);
    formData.set("documentType", documentType.trim());
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadResidentDocument(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDocumentType("");
      setFile(null);
      router.refresh();
    });
  }

  function handleReplaced() {
    router.refresh();
  }

  const activeDocuments = documents.filter((d) => d.status !== "superseded");
  const supersededDocuments = documents.filter((d) => d.status === "superseded");

  return (
    <div>
      {canManage && (
        <form onSubmit={handleUpload} className="mb-4 flex flex-wrap items-end gap-3 border-b border-ivory-border pb-4">
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-muted">
              Document Type
            </span>
            <input
              type="text"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              placeholder="e.g. Emergency Triage Assessment"
              className="w-64 rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none placeholder:text-subtle focus:border-gold/60"
            />
          </label>
          <FileUploadField
            label="File (PDF)"
            accept="application/pdf"
            value={file}
            onChange={setFile}
          />
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md bg-navy px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Uploading…" : "Upload"}
          </button>
        </form>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>
      )}

      {documents.length === 0 ? (
        <p className="font-sans text-sm text-muted">No documents on file.</p>
      ) : (
        <>
          <ul>
            {activeDocuments.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                evidence={evidenceForDocument(evidence, doc.id)}
                residentId={residentId}
                onReplaced={handleReplaced}
              />
            ))}
          </ul>
          {supersededDocuments.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-sans text-xs font-medium text-muted">
                {supersededDocuments.length} replaced document{supersededDocuments.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2">
                {supersededDocuments.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    document={doc}
                    evidence={evidenceForDocument(evidence, doc.id)}
                    residentId={residentId}
                    onReplaced={handleReplaced}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
