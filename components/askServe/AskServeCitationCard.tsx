"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { AskServeCitation } from "@/lib/askServe/answer/types";
import { OPERATIONAL_AUTHORITY_LABELS, SOURCE_STATUS_LABELS, SOURCE_TYPE_LABELS, isDraftOrNotBinding } from "./askServeLabels";

// Deliberately renders only what a reader needs to verify "yes, that is
// actually what our policy says" — no database ids, no rank/match
// scores, no raw JSON. See lib/askServe/answer/types.ts's AskServeCitation,
// which is already shaped to exclude anything implementation-internal.
export function AskServeCitationCard({ citation }: { citation: AskServeCitation }) {
  const [expanded, setExpanded] = useState(false);
  const draft = isDraftOrNotBinding(citation.operationalAuthority);

  const sectionLabel = citation.subsectionLabel
    ? `§${citation.sectionNumber} — ${citation.sectionTitle} (${citation.subsectionLabel})`
    : `§${citation.sectionNumber} — ${citation.sectionTitle}`;

  return (
    <div className={`rounded-lg border ${draft ? "border-amber-300 bg-amber-50/40" : "border-ivory-border bg-surface"}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
            {SOURCE_TYPE_LABELS[citation.sourceType]}
          </p>
          <p className="mt-1 font-sans text-sm font-medium text-body">{sectionLabel}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[10px] font-medium ${
                draft ? "bg-amber-200 text-amber-900" : "bg-navy/10 text-navy"
              }`}
            >
              {draft ? "DRAFT / PENDING — NOT BINDING" : OPERATIONAL_AUTHORITY_LABELS[citation.operationalAuthority]}
            </span>
            <span className="font-sans text-[10px] text-subtle">{SOURCE_STATUS_LABELS[citation.sourceStatus]}</span>
          </div>
        </div>
        <span className="mt-1 shrink-0 text-muted">
          {expanded ? <ChevronUp size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-ivory-border px-4 py-3">
          <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-body">{citation.excerpt}</p>
        </div>
      )}
    </div>
  );
}
