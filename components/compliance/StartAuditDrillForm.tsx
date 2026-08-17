"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAuditSessionAction } from "@/lib/actions/auditReadiness";
import type { AuditDrillScopeOption } from "@/lib/compliance/auditDrillView";

// A single-screen form, not a multi-step client wizard — starting an audit
// session is one action with a few fields, same weight as
// AssessmentCaptureButton.tsx's own trigger-plus-server-action shape.
export function StartAuditDrillForm({
  scopeOptions,
  defaultAuditor,
}: {
  scopeOptions: AuditDrillScopeOption[];
  defaultAuditor: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [auditor, setAuditor] = useState(defaultAuditor);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

  function toggleDomain(domainId: string) {
    setSelectedDomains((prev) => (prev.includes(domainId) ? prev.filter((d) => d !== domainId) : [...prev, domainId]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!auditor.trim()) {
      setError("Auditor is required.");
      return;
    }
    if (selectedDomains.length === 0) {
      setError("Select at least one scope domain.");
      return;
    }

    startTransition(async () => {
      const res = await startAuditSessionAction({
        name: name.trim(),
        description: description.trim() || null,
        scopeDomains: selectedDomains,
        auditor: auditor.trim(),
      });
      if (res.error || !res.session) {
        setError(res.error ?? "Could not start audit session.");
        return;
      }
      router.push(`/audit-readiness/drills/${res.session.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4 rounded-xl border border-ivory-border bg-white p-6">
      <label className="block">
        <span className="font-sans text-xs font-medium text-muted">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. August 2026 Employee Record Audit"
          className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="font-sans text-xs font-medium text-muted">Description (optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="font-sans text-xs font-medium text-muted">Auditor</span>
        <input
          type="text"
          value={auditor}
          onChange={(e) => setAuditor(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <div>
        <span className="font-sans text-xs font-medium text-muted">Scope Domains</span>
        <div className="mt-2 space-y-2">
          {scopeOptions.map((option) => (
            <label
              key={option.domainId}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-sans text-sm ${
                option.configured ? "border-ivory-border text-body" : "cursor-not-allowed border-ivory-border text-subtle"
              }`}
            >
              <input
                type="checkbox"
                disabled={!option.configured}
                checked={selectedDomains.includes(option.domainId)}
                onChange={() => toggleDomain(option.domainId)}
              />
              {option.label}
              {!option.configured && <span className="ml-auto text-xs">Not configured — no seeded requirements yet</span>}
              {option.configured && <span className="ml-auto text-xs text-muted">{option.subjects.length} subjects</span>}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Starting…" : "Start Audit"}
      </button>
    </form>
  );
}
