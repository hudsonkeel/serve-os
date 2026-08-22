"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAndAnalyzeCommunityRoster } from "@/lib/actions/communityRosterImport";
import { validateRosterFile } from "@/lib/residents/roster/rosterFileValidation";
import type { Community } from "@/lib/supabase/types";

interface RosterUploadFormProps {
  communities: Community[];
  preselectedCommunityId: string | null;
}

// Upload → Analyze, the first two steps of the Upload → Analyze → Review →
// Commit flow (section 4). Nothing here mutates a canonical resident —
// analysis is read-only against `residents` (Pass 1 scope); the operator
// lands on the review page next, which itself makes nothing happen until
// an explicit later commit.
export function RosterUploadForm({ communities, preselectedCommunityId }: RosterUploadFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [communityId, setCommunityId] = useState(preselectedCommunityId ?? "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!communityId) {
      setError("Select a community before importing.");
      return;
    }
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a roster file to upload.");
      return;
    }
    const validation = validateRosterFile({ size: file.size, type: file.type, name: file.name });
    if (!validation.ok) {
      setError(validation.error ?? "That file can't be used.");
      return;
    }

    const formData = new FormData();
    formData.set("communityId", communityId);
    formData.set("file", file);

    startTransition(async () => {
      setStatus("Uploading and analyzing…");
      const result = await uploadAndAnalyzeCommunityRoster(formData);
      if (result.error) {
        setError(result.error);
        setStatus(null);
        return;
      }
      const runId = result.alreadyImported?.runId ?? result.runId;
      if (!runId) {
        setError("Upload succeeded, but no import record was returned.");
        setStatus(null);
        return;
      }
      router.push(`/residents/roster-import/${runId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5 rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div>
        <label htmlFor="roster-community" className="block font-sans text-sm font-medium text-body">
          Community
        </label>
        <select
          id="roster-community"
          value={communityId}
          onChange={(e) => setCommunityId(e.target.value)}
          disabled={isPending}
          className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
        >
          <option value="">Select a community…</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 font-sans text-xs text-muted">Every resident created from this roster belongs to this community.</p>
      </div>

      <div>
        <label htmlFor="roster-file" className="block font-sans text-sm font-medium text-body">
          Roster file
        </label>
        <input
          id="roster-file"
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={isPending}
          className="mt-1.5 block w-full font-sans text-sm text-body file:mr-4 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:font-sans file:text-sm file:font-medium file:text-white hover:file:bg-navy-light"
        />
        <p className="mt-1 font-sans text-xs text-muted">CSV or Excel (.xlsx), up to 15 MB.</p>
      </div>

      {error && <p className="font-sans text-sm text-danger-text">{error}</p>}
      {status && !error && <p className="font-sans text-sm text-muted">{status}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-navy px-4 py-2 font-sans text-button font-medium text-white shadow-card transition-colors hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Working…" : "Upload & Analyze"}
      </button>
    </form>
  );
}
