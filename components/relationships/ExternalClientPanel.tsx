"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markExternalClientFormer,
  placeExternalClientOnHold,
  reactivateExternalClient,
} from "@/lib/actions/externalClients";
import {
  EXTERNAL_CLIENT_STATUS_LABELS,
  OPEN_ACTION_DISPOSITION_LABELS,
  OPEN_ACTION_DISPOSITIONS,
  OpenActionDisposition,
} from "@/lib/externalClients/constants";
import type { ExternalClient } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

function compactDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ReactivateForm({ relationshipId, onDone }: { relationshipId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nextActionTitle, setNextActionTitle] = useState("");
  const [nextActionDueAt, setNextActionDueAt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await reactivateExternalClient({ relationshipId, nextActionTitle, nextActionDueAt });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-ivory-border bg-surface px-4 py-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Next Action (optional)</span>
          <input type="text" value={nextActionTitle} onChange={(e) => setNextActionTitle(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Due</span>
          <input type="date" value={nextActionDueAt} onChange={(e) => setNextActionDueAt(e.target.value)} className={fieldClassName} />
        </label>
      </div>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Confirm Reactivation"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="font-sans text-sm text-muted hover:text-body">
          Cancel
        </button>
      </div>
    </form>
  );
}

function MarkFormerForm({ relationshipId, onDone }: { relationshipId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [effectiveEndDate, setEffectiveEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState<OpenActionDisposition>("keep_open");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await markExternalClientFormer({
        relationshipId,
        effectiveEndDate,
        reason,
        openActionDisposition: disposition,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-ivory-border bg-surface px-4 py-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Effective End Date</span>
          <input type="date" value={effectiveEndDate} onChange={(e) => setEffectiveEndDate(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Open Actions</span>
          <select value={disposition} onChange={(e) => setDisposition(e.target.value as OpenActionDisposition)} className={fieldClassName}>
            {OPEN_ACTION_DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {OPEN_ACTION_DISPOSITION_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className={labelClassName}>Reason (optional)</span>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClassName} />
      </label>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Confirm Former Client"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="font-sans text-sm text-muted hover:text-body">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ExternalClientPanel({ client }: { client: ExternalClient }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openForm, setOpenForm] = useState<"reactivate" | "former" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleHold() {
    setError(null);
    startTransition(async () => {
      const result = await placeExternalClientOnHold({ relationshipId: client.relationship_id });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">External Client</h3>
        <Badge tone={client.status === "active" ? "gold" : "neutral"}>{EXTERNAL_CLIENT_STATUS_LABELS[client.status]}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <p className={labelClassName}>Service Address</p>
          <p className="mt-0.5 font-sans text-sm text-body">
            {client.service_address_line_1}
            {client.service_address_line_2 ? `, ${client.service_address_line_2}` : ""}
            <br />
            {client.city}, {client.state} {client.postal_code}
          </p>
        </div>
        <div>
          <p className={labelClassName}>Service Start</p>
          <p className="mt-0.5 font-sans text-sm text-body">{compactDate(client.service_start_date)}</p>
        </div>
        {client.status === "former" && (
          <>
            <div>
              <p className={labelClassName}>Service End</p>
              <p className="mt-0.5 font-sans text-sm text-body">{compactDate(client.service_end_date)}</p>
            </div>
            <div>
              <p className={labelClassName}>Reason</p>
              <p className="mt-0.5 font-sans text-sm text-body">{client.former_reason ?? "-"}</p>
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-3 font-sans text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ivory-border pt-4">
        {client.status === "active" && (
          <>
            <button
              type="button"
              onClick={handleHold}
              disabled={isPending}
              className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed"
            >
              Place On Hold
            </button>
            <button
              type="button"
              onClick={() => setOpenForm(openForm === "former" ? null : "former")}
              className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
            >
              Mark Former Client
            </button>
          </>
        )}
        {client.status === "on_hold" && (
          <>
            <button
              type="button"
              onClick={() => setOpenForm(openForm === "reactivate" ? null : "reactivate")}
              className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
            >
              Reactivate
            </button>
            <button
              type="button"
              onClick={() => setOpenForm(openForm === "former" ? null : "former")}
              className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
            >
              Mark Former Client
            </button>
          </>
        )}
        {client.status === "former" && (
          <button
            type="button"
            onClick={() => setOpenForm(openForm === "reactivate" ? null : "reactivate")}
            className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
          >
            Reactivate
          </button>
        )}
      </div>

      {openForm === "reactivate" && (
        <ReactivateForm relationshipId={client.relationship_id} onDone={() => setOpenForm(null)} />
      )}
      {openForm === "former" && (
        <MarkFormerForm relationshipId={client.relationship_id} onDone={() => setOpenForm(null)} />
      )}
    </div>
  );
}
