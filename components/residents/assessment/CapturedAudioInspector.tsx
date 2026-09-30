"use client";

// Assessment Mobile Capture v0.1 — admin/manager-only inspection of ONE native-capture session's
// stored audio, for device Test #1. Not a general audio browser: the server actions refuse any
// session that wasn't recorded by native capture, and download links are short-lived (5 minutes)
// links to the raw, unmodified chunk blobs.

import { useState, useTransition } from "react";
import {
  inspectNativeCapturedAudio,
  createNativeCapturedAudioDownloadLinks,
  type CapturedAudioInspection,
} from "@/lib/actions/nativeAssessmentCapture";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function CapturedAudioInspector({ residentId, assessmentSessionId }: { residentId: string; assessmentSessionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [inspection, setInspection] = useState<CapturedAudioInspection | null>(null);
  const [links, setLinks] = useState<{ chunkIndex: number; runId: string | null; name: string; signedUrl: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await inspectNativeCapturedAudio({ residentId, assessmentSessionId });
      if (result.error || !result.inspection) {
        setError(result.error ?? "Could not inspect this recording.");
        return;
      }
      setInspection(result.inspection);
      setOpen(true);
    });
  }

  function loadLinks() {
    setError(null);
    startTransition(async () => {
      const result = await createNativeCapturedAudioDownloadLinks({ residentId, assessmentSessionId });
      if (result.error || !result.links) {
        setError(result.error ?? "Could not create download links.");
        return;
      }
      setLinks(result.links);
    });
  }

  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={load}
          disabled={isPending}
          className="font-sans text-xs font-semibold text-navy underline disabled:opacity-50"
        >
          {isPending ? "Loading…" : "Inspect captured audio (pilot)"}
        </button>
        {error && <p className="font-sans text-xs text-danger-text">{error}</p>}
      </div>
    );
  }

  const s = inspection?.summary;
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ivory-border bg-white p-3 font-sans text-xs text-body">
      {s && inspection && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted">Session</dt>
          <dd className="break-all font-mono">{inspection.assessmentSessionId}</dd>
          <dt className="text-muted">Status</dt>
          <dd>{inspection.status}{inspection.finalizedAt ? ` (finalized ${new Date(inspection.finalizedAt).toLocaleString()})` : ""}</dd>
          <dt className="text-muted">Runs</dt>
          <dd>{s.runCount}</dd>
          <dt className="text-muted">Chunks</dt>
          <dd>{s.chunkCount}</dd>
          <dt className="text-muted">MIME types</dt>
          <dd>{s.mimeTypes.join(", ") || "—"}</dd>
          <dt className="text-muted">Total size</dt>
          <dd>{formatBytes(s.totalBytes)}</dd>
          <dt className="text-muted">Indexes</dt>
          <dd className="break-all font-mono">{s.chunkIndexes.join(", ") || "—"}</dd>
          <dt className="text-muted">Gaps</dt>
          <dd className="font-mono">{s.gaps.length ? s.gaps.join(", ") : "none"}</dd>
          <dt className="text-muted">Duplicates</dt>
          <dd className="font-mono">{s.duplicates.length ? s.duplicates.join(", ") : "none"}</dd>
        </dl>
      )}
      {s && s.runs.length > 0 && (
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="font-medium">Run</th>
              <th className="font-medium">Chunks</th>
              <th className="font-medium">Indexes</th>
              <th className="font-medium">Size</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {s.runs.map((r) => (
              <tr key={r.runId}>
                <td>{r.runId}</td>
                <td>{r.chunkCount}</td>
                <td>
                  {r.firstChunkIndex}–{r.lastChunkIndex}
                </td>
                <td>{formatBytes(r.totalBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {links ? (
        <div className="space-y-1">
          <p className="text-muted">Download links expire in 5 minutes. Files are the original, unmodified recorded blobs.</p>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono">
            {links.map((l) => (
              <li key={l.name}>
                <a href={l.signedUrl} className="text-navy underline" rel="noreferrer">
                  {l.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <button type="button" onClick={loadLinks} disabled={isPending} className="font-semibold text-navy underline disabled:opacity-50">
          {isPending ? "Creating links…" : "Create 5-minute download links for raw chunks"}
        </button>
      )}
      <button type="button" onClick={() => setOpen(false)} className="block text-muted underline">
        Hide
      </button>
      {error && <p className="text-danger-text">{error}</p>}
    </div>
  );
}
