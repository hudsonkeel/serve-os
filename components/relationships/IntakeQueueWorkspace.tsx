"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  completeExternalServiceLocationForReview,
  dismissIntakeAsNotQualified,
  linkExistingResidentForReview,
  processAllUnprocessedIntakeSubmissions,
  processIntakeSubmission,
  retryFailedIntakeSubmission,
} from "@/lib/actions/intakeEngine";
import { searchResidentsForLinking } from "@/lib/actions/relationships";
import type { ResidentSearchResult } from "@/lib/data/relationships";
import type { IntakeProcessingRecord, WebsiteIntakeSubmission } from "@/lib/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

type QueueTab = "new" | "needs_review" | "processed" | "failed" | "not_qualified";

const TABS: { value: QueueTab; label: string }[] = [
  { value: "new", label: "New" },
  { value: "needs_review", label: "Needs Review" },
  { value: "processed", label: "Processed" },
  { value: "failed", label: "Failed" },
  { value: "not_qualified", label: "Not Qualified" },
];

function compactDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const fieldClassName =
  "h-9 rounded-md border border-ivory-border bg-surface px-2 font-sans text-sm text-body outline-none focus:border-gold/60";

function ConfidenceBadge({ band }: { band: string | null }) {
  const tone =
    band === "automatic" || band === "high_confidence" ? "gold" : band === "review_recommended" ? "warning" : "danger";
  return <Badge tone={tone}>{band ? band.replace(/_/g, " ") : "-"}</Badge>;
}

function ResidentLinkForm({ recordId, onDone }: { recordId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setResults(await searchResidentsForLinking(value));
  }

  function handleLink(residentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkExistingResidentForReview(recordId, residentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-2 max-w-sm rounded-md border border-ivory-border bg-ivory p-3">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search resident by name or unit..."
        className={`w-full ${fieldClassName} placeholder:text-subtle`}
      />
      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => handleLink(r.id)}
                disabled={isPending}
                className="w-full rounded px-2 py-1 text-left font-sans text-sm text-body hover:bg-ivory-warm"
              >
                {r.name}
                {r.unitNumber ? ` — Unit ${r.unitNumber}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 font-sans text-sm text-red-600">{error}</p>}
    </div>
  );
}

function ServiceLocationForm({ recordId, onDone }: { recordId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await completeExternalServiceLocationForReview(recordId, { line1, city, state, postalCode });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 max-w-lg space-y-2 rounded-md border border-ivory-border bg-ivory p-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Street" className={`col-span-2 ${fieldClassName} placeholder:text-subtle`} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={`${fieldClassName} placeholder:text-subtle`} />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" maxLength={2} className={`${fieldClassName} placeholder:text-subtle`} />
        <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="ZIP" className={`${fieldClassName} placeholder:text-subtle`} />
      </div>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed"
      >
        {isPending ? "Saving..." : "Complete & Create External Prospect"}
      </button>
    </form>
  );
}

function NeedsReviewRow({ record }: { record: IntakeProcessingRecord }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeForm, setActiveForm] = useState<"resident" | "location" | "dismiss" | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  const envelope = (record.normalized_envelope ?? {}) as Record<string, unknown>;
  const primaryContact = (envelope.primaryContact ?? {}) as Record<string, unknown>;
  const displayName = (primaryContact.fullName as string) ?? "Unnamed submission";

  const needsResident = record.reason_codes.some((c) =>
    ["RESIDENT_MATCH_REQUIRED", "MULTIPLE_RESIDENT_MATCHES", "INSUFFICIENT_RESIDENT_IDENTITY"].includes(c)
  );
  const needsLocation = record.reason_codes.includes("SERVICE_LOCATION_INCOMPLETE");

  function handleDismiss() {
    startTransition(async () => {
      await dismissIntakeAsNotQualified(record.id, dismissReason || "Dismissed by staff.");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-ivory-border align-top">
      <td className="px-4 py-3 font-sans text-sm text-body">
        {displayName}
        <div className="font-sans text-xs text-subtle">{record.intake_type.replace(/_/g, " ")}</div>
      </td>
      <td className="px-4 py-3">
        <ConfidenceBadge band={record.confidence_band} />
      </td>
      <td className="px-4 py-3 font-sans text-xs text-body">
        {record.reason_codes.join(", ")}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {needsResident && (
            <button
              type="button"
              onClick={() => setActiveForm(activeForm === "resident" ? null : "resident")}
              className="rounded-md border border-ivory-border px-2 py-1 font-sans text-xs font-medium text-body hover:border-navy/20"
            >
              Link Existing Resident
            </button>
          )}
          {needsLocation && (
            <button
              type="button"
              onClick={() => setActiveForm(activeForm === "location" ? null : "location")}
              className="rounded-md border border-ivory-border px-2 py-1 font-sans text-xs font-medium text-body hover:border-navy/20"
            >
              Complete Expected Service Location
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveForm(activeForm === "dismiss" ? null : "dismiss")}
            className="rounded-md border border-ivory-border px-2 py-1 font-sans text-xs font-medium text-muted hover:border-navy/20"
          >
            Dismiss
          </button>
        </div>
        {activeForm === "resident" && <ResidentLinkForm recordId={record.id} onDone={() => setActiveForm(null)} />}
        {activeForm === "location" && <ServiceLocationForm recordId={record.id} onDone={() => setActiveForm(null)} />}
        {activeForm === "dismiss" && (
          <div className="mt-2 flex max-w-sm items-center gap-2">
            <input
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Reason (optional)"
              className={`flex-1 ${fieldClassName} placeholder:text-subtle`}
            />
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed"
            >
              Confirm
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function NewSubmissionRow({ submission }: { submission: WebsiteIntakeSubmission }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleProcess() {
    setError(null);
    startTransition(async () => {
      const result = await processIntakeSubmission(submission.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-ivory-border">
      <td className="px-4 py-3 font-sans text-sm text-body">{submission.name ?? "-"}</td>
      <td className="px-4 py-3 font-sans text-sm text-body">{submission.intake_type.replace(/_/g, " ")}</td>
      <td className="px-4 py-3 font-sans text-sm text-body">{compactDateTime(submission.created_at)}</td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={handleProcess}
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed"
        >
          {isPending ? "Processing..." : "Process"}
        </button>
        {error && <p className="mt-1 font-sans text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

const VALID_TABS: readonly QueueTab[] = ["new", "needs_review", "processed", "failed", "not_qualified"];

function isQueueTab(value: string | undefined): value is QueueTab {
  return !!value && (VALID_TABS as readonly string[]).includes(value);
}

interface IntakeQueueWorkspaceProps {
  newSubmissions: WebsiteIntakeSubmission[];
  records: IntakeProcessingRecord[];
  initialTab?: string;
}

export function IntakeQueueWorkspace({ newSubmissions, records, initialTab }: IntakeQueueWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState<QueueTab>(
    isQueueTab(initialTab) ? initialTab : newSubmissions.length > 0 ? "new" : "needs_review"
  );
  const [isPending, startTransition] = useTransition();

  const grouped = useMemo(
    () => ({
      needs_review: records.filter((r) => r.processing_status === "needs_review"),
      processed: records.filter((r) => r.processing_status === "processed"),
      failed: records.filter((r) => r.processing_status === "failed"),
      not_qualified: records.filter((r) => r.processing_status === "not_qualified"),
    }),
    [records]
  );

  const counts: Record<QueueTab, number> = {
    new: newSubmissions.length,
    needs_review: grouped.needs_review.length,
    processed: grouped.processed.length,
    failed: grouped.failed.length,
    not_qualified: grouped.not_qualified.length,
  };

  function handleProcessAll() {
    startTransition(async () => {
      await processAllUnprocessedIntakeSubmissions();
      router.refresh();
    });
  }

  function handleRetry(submissionId: string) {
    startTransition(async () => {
      await retryFailedIntakeSubmission(submissionId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 border-b border-ivory-border">
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTab(option.value)}
            className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors ${
              tab === option.value ? "border-b-navy text-navy" : "border-b-transparent text-muted hover:text-body"
            }`}
          >
            {option.label}
            <span
              className={`rounded-full px-2 py-0.5 font-sans text-label font-semibold leading-none ${
                tab === option.value ? "bg-navy text-white" : "bg-ivory-warm text-muted"
              }`}
            >
              {counts[option.value]}
            </span>
          </button>
        ))}
      </div>

      {tab === "new" && (
        <div className="space-y-3">
          {newSubmissions.length > 0 && (
            <button
              type="button"
              onClick={handleProcessAll}
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed"
            >
              {isPending ? "Processing..." : "Process All New Submissions"}
            </button>
          )}
          {newSubmissions.length === 0 ? (
            <EmptyState description="No new website submissions waiting to be processed." />
          ) : (
            <table className="w-full min-w-[700px] rounded-xl border border-ivory-border bg-surface">
              <thead>
                <tr className="border-b border-ivory-border text-left">
                  {["Name", "Type", "Received", ""].map((h) => (
                    <th key={h} className="px-4 py-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {newSubmissions.map((s) => (
                  <NewSubmissionRow key={s.id} submission={s} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "needs_review" &&
        (grouped.needs_review.length === 0 ? (
          <EmptyState description="Nothing needs review right now." />
        ) : (
          <table className="w-full min-w-[900px] rounded-xl border border-ivory-border bg-surface">
            <thead>
              <tr className="border-b border-ivory-border text-left">
                {["Submission", "Confidence", "Reasons", "Resolve"].map((h) => (
                  <th key={h} className="px-4 py-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.needs_review.map((r) => (
                <NeedsReviewRow key={r.id} record={r} />
              ))}
            </tbody>
          </table>
        ))}

      {tab === "processed" &&
        (grouped.processed.length === 0 ? (
          <EmptyState description="No submissions have been processed yet." />
        ) : (
          <table className="w-full min-w-[700px] rounded-xl border border-ivory-border bg-surface">
            <thead>
              <tr className="border-b border-ivory-border text-left">
                {["Classification", "Confidence", "Processed", "Record"].map((h) => (
                  <th key={h} className="px-4 py-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.processed.map((r) => (
                <tr key={r.id} className="border-b border-ivory-border">
                  <td className="px-4 py-3 font-sans text-sm text-body">{r.classification?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <ConfidenceBadge band={r.confidence_band} />
                  </td>
                  <td className="px-4 py-3 font-sans text-sm text-body">{compactDateTime(r.processed_at)}</td>
                  <td className="px-4 py-3">
                    {r.relationship_id && (
                      <Link href={`/relationships/${r.relationship_id}`} className="font-sans text-sm text-navy hover:text-navy-light">
                        Open Relationship
                      </Link>
                    )}
                    {!r.relationship_id && r.recruiting_lead_id && (
                      <span className="font-sans text-sm text-subtle">Recruiting Lead</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {tab === "failed" &&
        (grouped.failed.length === 0 ? (
          <EmptyState description="No failed processing attempts." />
        ) : (
          <table className="w-full min-w-[700px] rounded-xl border border-ivory-border bg-surface">
            <thead>
              <tr className="border-b border-ivory-border text-left">
                {["Type", "Error", "Retries", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.failed.map((r) => (
                <tr key={r.id} className="border-b border-ivory-border">
                  <td className="px-4 py-3 font-sans text-sm text-body">{r.intake_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 font-sans text-xs text-red-600">{r.last_error}</td>
                  <td className="px-4 py-3 font-sans text-sm text-body">{r.retry_count}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleRetry(r.source_submission_id)}
                      disabled={isPending}
                      className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body hover:border-navy/20 disabled:cursor-not-allowed"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {tab === "not_qualified" &&
        (grouped.not_qualified.length === 0 ? (
          <EmptyState description="No submissions have been marked Not Qualified." />
        ) : (
          <table className="w-full min-w-[700px] rounded-xl border border-ivory-border bg-surface">
            <thead>
              <tr className="border-b border-ivory-border text-left">
                {["Type", "Reasons", "Marked"].map((h) => (
                  <th key={h} className="px-4 py-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.not_qualified.map((r) => (
                <tr key={r.id} className="border-b border-ivory-border">
                  <td className="px-4 py-3 font-sans text-sm text-body">{r.intake_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 font-sans text-xs text-body">{r.reason_codes.join(", ")}</td>
                  <td className="px-4 py-3 font-sans text-sm text-body">{compactDateTime(r.processed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
