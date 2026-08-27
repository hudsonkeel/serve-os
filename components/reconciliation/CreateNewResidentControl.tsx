"use client";

import { useState, useTransition } from "react";
import { createResidentFromAxisCareRecord } from "@/lib/actions/reconciliation";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

// "Create New Resident" — the third resolution path (AxisCare
// Reconciliation + Multi-Source Identity Ingestion phase). Offered
// alongside Match to Existing Person, never in place of it — the operator
// chooses. Community and name are prefilled from AxisCare but always
// editable before submit; the server action re-runs a fresh duplicate
// check immediately before creating anything (see
// findFreshCredibleResidentMatch), so this control never bypasses
// identity matching even though its own form has no search step.
interface CreateNewResidentControlProps {
  axiscareId: string;
  vendorDisplayName: string;
  firstName: string;
  lastName: string;
  classes: string[];
  resolvedCommunityId: string | null;
  resolvedCommunityName: string | null;
}

type Mode = "idle" | "form";

export function CreateNewResidentControl({
  axiscareId,
  vendorDisplayName,
  firstName: initialFirstName,
  lastName: initialLastName,
  classes,
  resolvedCommunityId,
  resolvedCommunityName,
}: CreateNewResidentControlProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { type: "error"; text: string } | { type: "success"; residentId: string; syncWarning?: string } | null
  >(null);

  function submit() {
    if (!resolvedCommunityId || !resolvedCommunityName) return;
    setResult(null);
    startTransition(async () => {
      const outcome = await createResidentFromAxisCareRecord({
        axiscareId,
        vendorDisplayName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        communityId: resolvedCommunityId,
        communityName: resolvedCommunityName,
        classes,
      });
      if (outcome.error || !outcome.residentId) {
        setResult({ type: "error", text: outcome.error ?? "Could not create a resident." });
        return;
      }
      setResult({ type: "success", residentId: outcome.residentId, syncWarning: outcome.syncWarning });
      setMode("idle");
    });
  }

  if (result?.type === "success") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="success">Resident Created</Badge>
          <LinkButton href={`/residents/${result.residentId}`} size="small">
            View resident →
          </LinkButton>
        </div>
        {result.syncWarning && <span className="font-sans text-xs text-warning-text">{result.syncWarning}</span>}
      </div>
    );
  }

  if (!resolvedCommunityId) {
    // Section 6/11: community must be genuinely known before a resident
    // can be created for it — never defaulted, never invented. The
    // operator's remaining path here is Match to Existing Person or
    // Exclude, until this record's community is actually resolved.
    return (
      <p className="font-sans text-xs text-subtle">
        Create New Resident unavailable — this record&rsquo;s community could not be determined.
      </p>
    );
  }

  if (mode === "form") {
    return (
      <div className="space-y-2 rounded-lg border border-ivory-border bg-ivory p-3">
        <p className="font-sans text-sm font-medium text-body">
          Create a new resident in <span className="font-semibold">{resolvedCommunityName}</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="w-1/2 rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="w-1/2 rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending || !firstName.trim() || !lastName.trim()}
            onClick={submit}
            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create Resident"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setMode("idle")}
            className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {result?.type === "error" && <p className="font-sans text-sm text-danger-text">{result.text}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setMode("form")}
      className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body hover:bg-ivory"
    >
      Create New Resident
    </button>
  );
}
