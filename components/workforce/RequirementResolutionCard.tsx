"use client";

import { useEffect, useRef, useState } from "react";
import { RegistryEvidenceCard } from "@/components/workforce/RegistryEvidenceCard";
import { HumanAttestationDialog } from "@/components/workforce/HumanAttestationDialog";
import { getRequirementPlaybook } from "@/lib/workforce/requirementPlaybooks";
import { deriveOperationalUnderstanding } from "@/lib/workforce/operationalUnderstanding";
import { EVIDENCE_ASSURANCE_STYLES } from "@/lib/workforce/evidenceAssurance";
import { attentionStateForRequirement } from "@/lib/workforce/attentionState";
import {
  ATTESTATION_RESULT_LABELS,
  AUTHORITATIVE_SOURCE_LABELS,
  COLLECTION_METHOD_LABELS,
} from "@/lib/workforce/humanAttestation";
import { ATTENTION_STATE_LABELS, ATTENTION_STATE_STYLES } from "@/components/workforce/WorkforceRosterTable";
import type { RequirementEvaluation } from "@/lib/compliance/requirementSetStatus";
import type { PersonEvidence } from "@/lib/supabase/types";
import type { WorkforceLifecycleStatus } from "@/lib/workforce/lifecycleStatus";

function evidenceAvailableText(evaluation: RequirementEvaluation): string {
  const { latestEvidence } = evaluation;
  if (!latestEvidence) return "None on file.";
  const parts = [`Recorded ${new Date(latestEvidence.created_at).toLocaleDateString()}`];
  parts.push(latestEvidence.verification_status === "verified" ? "verified" : latestEvidence.verification_status.replace(/_/g, " "));
  if (latestEvidence.result) parts.push(latestEvidence.result.replace(/_/g, " "));
  if (latestEvidence.numeric_score !== null) parts.push(`score ${latestEvidence.numeric_score}`);
  return `${parts[0]} — ${parts.slice(1).join(", ")}.`;
}

function evidenceNeededText(evaluation: RequirementEvaluation): string {
  switch (evaluation.status) {
    case "missing":
      return "Nothing on file yet — evidence needs to be recorded.";
    case "awaiting_verification":
      return "Evidence is on file — an admin or manager needs to verify it.";
    case "expired":
      return "The evidence on file has lapsed — a current renewal needs to be recorded.";
    case "requires_review":
      return "The evidence on file didn't clear review — a corrected or renewed record is needed.";
    case "expiring_soon":
      return "Currently satisfied — a renewal will be needed before it lapses.";
    case "satisfied":
      return "Nothing further needed right now.";
  }
}

// How a single evidence row was collected, for display — distinguishes
// machine-collected (API sync/structured import), human-attested,
// uploaded documentation, and (in future) a Digital Compatriot observation,
// exactly as the Requirement Detail View is meant to. Falls back to
// "Document Upload" for older rows that predate collection_method (Phase
// 1D, additive — every pre-existing row simply has it null).
function collectionMethodLabel(evidence: PersonEvidence): string {
  if (evidence.collection_method) return COLLECTION_METHOD_LABELS[evidence.collection_method];
  return evidence.document_id ? "Document Upload" : "Manual Entry";
}

function EvidenceHistoryRow({ evidence }: { evidence: PersonEvidence }) {
  return (
    <li className="border-l-2 border-ivory-border pl-3 font-sans text-xs text-body">
      <p className="font-medium">
        {collectionMethodLabel(evidence)}
        {evidence.authoritative_source_system && ` — ${AUTHORITATIVE_SOURCE_LABELS[evidence.authoritative_source_system]}`}
      </p>
      <p className="text-muted">
        {evidence.verification_status.replace(/_/g, " ")}
        {evidence.attestation_result && ` — ${ATTESTATION_RESULT_LABELS[evidence.attestation_result]}`}
      </p>
      {evidence.verified_by && (
        <p className="text-muted">
          By {evidence.verified_by}
          {evidence.verified_at ? ` on ${new Date(evidence.verified_at).toLocaleString()}` : ""}
        </p>
      )}
    </li>
  );
}

// Level 2 (compact row) -> Level 3 (playbook + three-axis understanding,
// evidence provenance, and Verify From Source) -> Level 4 (the existing,
// unmodified RegistryEvidenceCard, toggle-revealed). This is the
// Attention-Driven Operations product's progressive-disclosure unit for a
// single requirement determination — it never recomputes status; it only
// presents what lib/compliance/requirementSetStatus.ts,
// lib/workforce/operationalUnderstanding.ts, and
// lib/workforce/evidenceAssurance.ts already derived.
export function RequirementResolutionCard({
  evaluation,
  workforceMemberId,
  canManage,
  rosterOptions,
  lifecycleStatus,
  history,
  autoExpand = false,
}: {
  evaluation: RequirementEvaluation;
  workforceMemberId: string;
  canManage: boolean;
  history: PersonEvidence[];
  lifecycleStatus: WorkforceLifecycleStatus;
  rosterOptions: Array<{ workforceMemberId: string; displayName: string }>;
  // Set when arriving here via a "Resolve →" link elsewhere (e.g. Audit
  // Readiness's Needs Attention) — expands straight to the evidence level
  // and scrolls into view, so the link is a real fix path, not a pointer
  // at a page the reader still has to search.
  autoExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [showEvidence, setShowEvidence] = useState(autoExpand);
  const [showHistory, setShowHistory] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoExpand) cardRef.current?.scrollIntoView({ block: "center" });
    // Only ever run on mount for the one card this page landed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attention = attentionStateForRequirement(evaluation);
  const playbook = getRequirementPlaybook(evaluation.requirement.requirement_code);
  const understanding = deriveOperationalUnderstanding(evaluation);
  const { latestEvidence } = evaluation;
  const nextActionLabel =
    attention === "ready"
      ? "No action required"
      : {
          action_needed: evaluation.status === "expired" ? `Renew ${evaluation.requirement.name}` : `Upload ${evaluation.requirement.name}`,
          due_soon: `Renew ${evaluation.requirement.name} before it expires`,
          review: `Review ${evaluation.requirement.name}`,
          waiting: `Verify ${evaluation.requirement.name}`,
        }[attention as "action_needed" | "due_soon" | "review" | "waiting"];

  return (
    <div ref={cardRef} className="rounded-xl border border-ivory-border bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate font-sans text-sm font-medium text-body">{evaluation.requirement.name}</span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${ATTENTION_STATE_STYLES[attention]}`}
        >
          {ATTENTION_STATE_LABELS[attention]}
        </span>
        <span className="hidden min-w-0 flex-1 truncate font-sans text-xs text-muted sm:block">{nextActionLabel}</span>
        <span className="shrink-0 font-sans text-xs text-muted">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-ivory-border px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Operational Understanding</p>
              <p className="mt-0.5 font-sans text-sm text-body">{understanding.operationalUnderstanding}</p>
            </div>
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Evidence Assurance</p>
              <span
                className={`mt-0.5 inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${EVIDENCE_ASSURANCE_STYLES[understanding.evidenceAssurance]}`}
              >
                {understanding.evidenceAssurance}
              </span>
            </div>
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Audit Readiness</p>
              <p className="mt-0.5 font-sans text-sm text-body">{understanding.auditReadiness}</p>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg bg-ivory-warm px-4 py-3 sm:grid-cols-4">
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Authoritative Source</p>
              <p className="mt-0.5 font-sans text-sm text-body">
                {latestEvidence?.authoritative_source_system
                  ? AUTHORITATIVE_SOURCE_LABELS[latestEvidence.authoritative_source_system]
                  : "—"}
              </p>
            </div>
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Verified By</p>
              <p className="mt-0.5 font-sans text-sm text-body">{latestEvidence?.verified_by ?? "—"}</p>
            </div>
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Verified At</p>
              <p className="mt-0.5 font-sans text-sm text-body">
                {latestEvidence?.verified_at ? new Date(latestEvidence.verified_at).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Observed Result</p>
              <p className="mt-0.5 font-sans text-sm text-body">
                {latestEvidence?.attestation_result ? ATTESTATION_RESULT_LABELS[latestEvidence.attestation_result] : "—"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Evidence Available</p>
              <p className="mt-0.5 font-sans text-sm text-body">{evidenceAvailableText(evaluation)}</p>
            </div>
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Evidence Needed</p>
              <p className="mt-0.5 font-sans text-sm text-body">{evidenceNeededText(evaluation)}</p>
            </div>
          </div>

          <div>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Why</p>
            <p className="mt-0.5 font-sans text-sm text-body">{evaluation.explanation}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Next Action</p>
              <p className="mt-0.5 font-sans text-sm text-body">{nextActionLabel}</p>
              <p className="mt-1 font-sans text-xs text-muted">{playbook.resolutionInstructions}</p>
            </div>
            <div>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Where &amp; How Long</p>
              <p className="mt-0.5 font-sans text-sm text-body">{playbook.primaryResponsibleRole}</p>
              <p className="mt-1 font-sans text-xs text-muted">
                About {playbook.estimatedCompletionMinutes} minutes · Typical source: {playbook.authoritativeSource}
                {playbook.deepLink && (
                  <>
                    {" · "}
                    <a href={playbook.deepLink.url} className="text-navy underline hover:text-navy-light">
                      {playbook.deepLink.label}
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>

          <div>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">Operational Context</p>
            <p className="mt-0.5 font-sans text-xs text-muted">{playbook.operationalContext}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-muted">
            <span>Verification: {playbook.verificationRequirement}</span>
            <span>Effect: {playbook.expectedCompletionEffect}</span>
          </div>

          {canManage && (
            <div className="border-t border-ivory-border pt-4">
              <HumanAttestationDialog
                workforceMemberId={workforceMemberId}
                requirementCode={evaluation.requirement.requirement_code}
                currentEvidenceId={latestEvidence?.id ?? null}
                playbook={playbook}
              />
            </div>
          )}

          {history.length > 0 && (
            <div className="border-t border-ivory-border pt-3">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="font-sans text-xs font-medium text-muted underline hover:text-body"
              >
                {showHistory ? "Hide verification history" : `View verification history (${history.length})`}
              </button>
              {showHistory && (
                <ul className="mt-3 space-y-3">
                  {history
                    .slice()
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((e) => (
                      <EvidenceHistoryRow key={e.id} evidence={e} />
                    ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-ivory-border pt-3">
            <button
              type="button"
              onClick={() => setShowEvidence((v) => !v)}
              className="font-sans text-xs font-medium text-navy underline hover:text-navy-light"
            >
              {showEvidence ? "Hide evidence & verification" : "Show evidence & verification"}
            </button>
            {showEvidence && (
              <div className="mt-3">
                <RegistryEvidenceCard
                  evaluation={evaluation}
                  workforceMemberId={workforceMemberId}
                  canManage={canManage}
                  rosterOptions={rosterOptions}
                  lifecycleStatus={lifecycleStatus}
                  history={history}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
