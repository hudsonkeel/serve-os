"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { RequirementStatusCard, resolveStatusCardCta } from "@/components/compliance/AttentionCard";
import { EvidenceViewButton } from "@/components/compliance/EvidenceViewButton";
import { getResidentDocumentDownloadUrl } from "@/lib/actions/residentEvidence";
import { rejectResidentEvidenceAction, verifyResidentEvidenceAction } from "@/lib/actions/clientReadiness";
import { DocumentEvidenceForm } from "@/components/clientReadiness/DocumentEvidenceForm";
import { ClientProfileRemediationForm } from "@/components/clientReadiness/ClientProfileRemediationForm";
import { ServiceAgreementEvidenceForm } from "@/components/clientReadiness/ServiceAgreementEvidenceForm";
import { MedicationListAttestationForm } from "@/components/clientReadiness/MedicationListAttestationForm";
import { CareDocumentationAttestationForm } from "@/components/clientReadiness/CareDocumentationAttestationForm";
import { TriageClassificationControl } from "@/components/clientReadiness/TriageClassificationControl";
import type { TriageClassificationDetail } from "@/lib/clientReadiness/triageClassificationDetail";
import type { ResidentTriageClassification } from "@/lib/data/residentTriageClassifications";
import {
  CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES,
  CR_ASSESSMENT_CURRENT,
  CR_BILLING_AGREEMENT_ON_FILE,
  CR_CARE_DOCUMENTATION_CURRENT,
  CR_CLIENT_PROFILE_ON_FILE,
  CR_DISCHARGE_SUMMARY_ON_FILE,
  CR_ISP_ON_FILE_AND_CURRENT,
  CR_MEDICATION_LIST_ON_FILE,
  CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED,
  CR_SIGNIFICANT_EVENTS_DOCUMENTED,
  CR_SUPERVISORY_VISIT_RECORDED,
  EP_CLIENT_TRIAGE_CLASSIFIED,
} from "@/lib/clientReadiness/constants";
import type { AuditReadinessStatus } from "@/lib/compliance/auditReadinessStatus";

export interface ClientReadinessBoardItem {
  requirementCode: string;
  requirementName: string;
  regulatoryAuthority: string | null;
  status: AuditReadinessStatus;
  explanation: string;
  evidenceSummary: string | null;
  evidenceDocumentId: string | null;
  // Office Staff Client Readiness v0.1 — the underlying person_evidence
  // row id, needed by the verify/reject control below. Null whenever no
  // evidence row exists yet (e.g. a genuinely missing requirement).
  evidenceId: string | null;
}

function isSatisfiedStatus(status: AuditReadinessStatus): boolean {
  return status === "compliant" || status === "satisfied_by_event" || status === "exception";
}

// Office Staff Client Readiness v0.1 — the requirement-tier split.
// Document-backed requirements (ordinary upload/supersede work) are
// gated by canManageResidentDocuments, which now includes office_staff.
// Attestation/governed requirements (a direct human confirmation or a
// clinical classification — never a document upload) stay gated by
// canAccessResidentEvidence, unchanged, office_staff excluded.
// CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES is shared with
// PeopleReadinessView.tsx (lib/clientReadiness/constants.ts) so the CTA
// label/remediation form here and the Needs Attention card there can never
// disagree about which tier a requirement belongs to.
function canActOnRequirement(requirementCode: string, canManageDocuments: boolean, canManageAttestations: boolean): boolean {
  return CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES.has(requirementCode) ? canManageAttestations : canManageDocuments;
}

// Direct, requirement-specific CTAs — "Review & Resolve" is avoided
// wherever the actual action is already known (every requirement here
// has exactly one governed remediation path; see RequirementActions
// below). CR_CLIENT_PROFILE_ON_FILE is handled separately since its
// label depends on which of physician/guardian is actually missing.
const REQUIREMENT_ACTION_LABELS: Record<string, string> = {
  [CR_ASSESSMENT_CURRENT]: "Start or Upload Assessment",
  [EP_CLIENT_TRIAGE_CLASSIFIED]: "Record Triage Classification",
  [CR_ISP_ON_FILE_AND_CURRENT]: "Upload ISP",
  [CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED]: "Upload Service Agreement",
  [CR_BILLING_AGREEMENT_ON_FILE]: "Upload Billing Document",
  [CR_MEDICATION_LIST_ON_FILE]: "Verify Medication List",
  [CR_CARE_DOCUMENTATION_CURRENT]: "Verify Care Documentation",
  [CR_SUPERVISORY_VISIT_RECORDED]: "Upload Supervisory Visit",
  [CR_SIGNIFICANT_EVENTS_DOCUMENTED]: "Record Significant Event",
  [CR_DISCHARGE_SUMMARY_ON_FILE]: "Upload Discharge Summary",
};

// canManageDocuments/canManageAttestations narrow the CTA itself now —
// a viewer who can't act on this specific requirement (e.g. office_staff
// looking at Triage Classification) sees "View Requirement →", never a
// verb implying they can resolve it. Matches resolveStatusCardCta's own
// not_applicable convention.
function resolveClientReadinessCta(
  item: ClientReadinessBoardItem,
  careContacts: ClientReadinessCareContacts,
  canManageDocuments: boolean,
  canManageAttestations: boolean
): string {
  if (isSatisfiedStatus(item.status)) return "View Evidence →";
  if (item.status === "not_applicable") return "View Requirement →";
  if (!canActOnRequirement(item.requirementCode, canManageDocuments, canManageAttestations)) return "View Requirement →";

  if (item.requirementCode === CR_CLIENT_PROFILE_ON_FILE) {
    const missingPhysician = !careContacts.physicianName || !careContacts.physicianPhone;
    const guardianUnresolved = !(careContacts.guardianName && careContacts.guardianPhone) && !careContacts.guardianConfirmedNone;
    if (missingPhysician) return "Add Physician →";
    if (guardianUnresolved) return "Resolve Guardian →";
    return "Review & Resolve →";
  }

  const label = REQUIREMENT_ACTION_LABELS[item.requirementCode];
  return label ? `${label} →` : resolveStatusCardCta(item.status);
}

// Office Staff Client Readiness v0.1 — the verify/reject control for
// evidence sitting at Awaiting Verification. Genuinely new: no resident-
// domain equivalent existed before this slice (every prior evidence
// write self-verified). Calls the new verifyResidentEvidenceAction/
// rejectResidentEvidenceAction (lib/actions/clientReadiness.ts), which
// are gated by canVerifyResidentEvidence server-side regardless of
// whether this control even renders — this component only controls
// whether the button is offered, never the real authorization.
function EvidenceVerificationControl({ evidenceId, residentId }: { evidenceId: string; residentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyResidentEvidenceAction({ evidenceId, residentId, notes: notes.trim() || null });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReject() {
    if (!notes.trim()) {
      setError("A reason is required to reject this evidence.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rejectResidentEvidenceAction({ evidenceId, residentId, notes });
      if (result.error) {
        setError(result.error);
        return;
      }
      setRejecting(false);
      setNotes("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-ivory-border pt-3">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Verify This Evidence</p>
      {rejecting ? (
        <div className="space-y-2">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for rejecting (required)"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-xs text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleReject}
              className="rounded-md bg-red-600 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Confirm Reject
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setNotes("");
                setError(null);
              }}
              className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-xs text-muted hover:border-navy/20"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-56 rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-xs text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={handleVerify}
            className="rounded-md bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Verify
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setRejecting(true)}
            className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-xs text-muted hover:border-navy/20"
          >
            Reject
          </button>
        </div>
      )}
      {error && <p className="font-sans text-xs text-red-600">{error}</p>}
    </div>
  );
}

// The requirement-specific remediation experience each card's CTA opens
// into — the card only identifies state; this performs the work. One
// action per requirement, chosen for what's actually governed:
//   - Client Profile resolves physician/guardian directly here
//     (ClientProfileRemediationForm), reusing the exact same canonical
//     write paths the resident page's own Care Contacts card uses — no
//     duplicate storage, no forcing the user to scroll away from the
//     card that flagged the gap.
//   - Assessment has no manual action at all — it's Serve-native,
//     automatically governed when a Serve Assessment is approved.
//   - Everything else takes a document upload or a Verify From Source
//     attestation, per the approved evidence architecture.
function resolveRequirementSpecificContent({
  item,
  residentId,
  canManageDocuments,
  canManageAttestations,
  careContacts,
  triageDetail,
  triageHistory,
}: {
  item: ClientReadinessBoardItem;
  residentId: string;
  canManageDocuments: boolean;
  canManageAttestations: boolean;
  careContacts: ClientReadinessCareContacts;
  triageDetail: TriageClassificationDetail;
  triageHistory: ResidentTriageClassification[];
}) {
  // Single gate for every branch below — canActOnRequirement already
  // knows which tier each requirement code belongs to (see its own
  // comment), so this can never drift from what resolveClientReadinessCta
  // promises the CTA label means.
  if (!canActOnRequirement(item.requirementCode, canManageDocuments, canManageAttestations)) return null;

  if (item.requirementCode === CR_CLIENT_PROFILE_ON_FILE) {
    const missingPhysician = !careContacts.physicianName || !careContacts.physicianPhone;
    const guardianUnresolved =
      !(careContacts.guardianName && careContacts.guardianPhone) && !careContacts.guardianConfirmedNone;
    return (
      <ClientProfileRemediationForm
        residentId={residentId}
        missingPhysician={missingPhysician}
        guardianUnresolved={guardianUnresolved}
        currentPhysicianName={careContacts.physicianName}
        currentPhysicianPhone={careContacts.physicianPhone}
        currentGuardianName={careContacts.guardianName}
        currentGuardianPhone={careContacts.guardianPhone}
      />
    );
  }

  if (item.requirementCode === CR_ASSESSMENT_CURRENT) {
    // Two legitimate paths to the same requirement: a Serve-native
    // Assessment (automatic, no button — the whole point of that
    // pipeline) and a real assessment that predates Serve's own capture
    // system, brought in the same way every other document-backed
    // requirement is (recordDocumentEvidence(), already proven for ISP/
    // Service Agreement/Supervisory Visit). Never forces a reassessment
    // merely because Serve didn't exist yet when the real one happened.
    if (isSatisfiedStatus(item.status)) {
      return <p className="font-sans text-xs text-muted">Satisfied — recorded automatically from an approved Serve Assessment.</p>;
    }
    return (
      <div className="space-y-2">
        <p className="font-sans text-xs text-muted">Recorded automatically when a Serve Assessment is approved.</p>
        <DocumentEvidenceForm residentId={residentId} requirementCode={item.requirementCode} label="Upload Existing Assessment" />
      </div>
    );
  }

  if (item.requirementCode === EP_CLIENT_TRIAGE_CLASSIFIED) {
    return <TriageClassificationControl residentId={residentId} triageDetail={triageDetail} triageHistory={triageHistory} />;
  }

  if (item.requirementCode === CR_ISP_ON_FILE_AND_CURRENT) {
    return <DocumentEvidenceForm residentId={residentId} requirementCode={item.requirementCode} label="Upload ISP" />;
  }

  if (item.requirementCode === CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED) {
    return <ServiceAgreementEvidenceForm residentId={residentId} />;
  }

  if (item.requirementCode === CR_BILLING_AGREEMENT_ON_FILE) {
    return (
      <div className="space-y-2">
        <p className="font-sans text-xs text-muted">Usually satisfied automatically from the Service Agreement.</p>
        <DocumentEvidenceForm residentId={residentId} requirementCode={item.requirementCode} label="Upload Separate Billing Document" />
      </div>
    );
  }

  if (item.requirementCode === CR_MEDICATION_LIST_ON_FILE) {
    return <MedicationListAttestationForm residentId={residentId} />;
  }

  if (item.requirementCode === CR_CARE_DOCUMENTATION_CURRENT) {
    return <CareDocumentationAttestationForm residentId={residentId} />;
  }

  if (item.requirementCode === CR_SUPERVISORY_VISIT_RECORDED) {
    return <DocumentEvidenceForm residentId={residentId} requirementCode={item.requirementCode} label="Record Supervisory Visit" dateLabel="Visit Date" />;
  }

  if (item.requirementCode === CR_SIGNIFICANT_EVENTS_DOCUMENTED) {
    return <DocumentEvidenceForm residentId={residentId} requirementCode={item.requirementCode} label="Record Significant Event" dateLabel="Event Date" />;
  }

  if (item.requirementCode === CR_DISCHARGE_SUMMARY_ON_FILE) {
    return <DocumentEvidenceForm residentId={residentId} requirementCode={item.requirementCode} label="Upload Discharge Summary" dateLabel="Discharge Date" />;
  }

  return null;
}

// canManageDocuments/canManageAttestations govern the requirement-
// specific remediation content above — resolveRequirementSpecificContent's
// own canActOnRequirement gate decides which one applies per requirement
// code, so this component just passes both through. canVerify is
// independent and narrower (canVerifyResidentEvidence, office_staff
// always false): the verify/reject control below only ever renders for a
// requirement actually sitting at Awaiting Verification with a real
// evidence row to act on — never for Missing (nothing to verify yet) or
// for a requirement type that never reaches needs_review in practice
// (Client Profile, Triage — both self-verify whenever they're written at
// all).
function RequirementActions({
  item,
  residentId,
  canManageDocuments,
  canManageAttestations,
  canVerify,
  careContacts,
  triageDetail,
  triageHistory,
}: {
  item: ClientReadinessBoardItem;
  residentId: string;
  canManageDocuments: boolean;
  canManageAttestations: boolean;
  canVerify: boolean;
  careContacts: ClientReadinessCareContacts;
  triageDetail: TriageClassificationDetail;
  triageHistory: ResidentTriageClassification[];
}) {
  const specificContent = resolveRequirementSpecificContent({
    item,
    residentId,
    canManageDocuments,
    canManageAttestations,
    careContacts,
    triageDetail,
    triageHistory,
  });
  const showVerification = canVerify && item.status === "needs_review" && Boolean(item.evidenceId);

  if (!specificContent && !showVerification) return null;

  return (
    <div>
      {specificContent}
      {showVerification && <EvidenceVerificationControl evidenceId={item.evidenceId as string} residentId={residentId} />}
    </div>
  );
}

// The resident's current physician/guardian state, for
// CR_CLIENT_PROFILE_ON_FILE's own direct-remediation form — the same
// canonical fields the resident page's Care Contacts card already
// reads, passed straight through rather than re-fetched.
export interface ClientReadinessCareContacts {
  physicianName: string;
  physicianPhone: string;
  guardianName: string;
  guardianPhone: string;
  guardianConfirmedNone: boolean;
}

export function ClientReadinessBoard({
  residentId,
  items,
  canManageDocuments,
  canManageAttestations,
  canVerify,
  canViewDocuments,
  initialSelectedCode,
  careContacts,
  triageDetail,
  triageHistory,
}: {
  residentId: string;
  items: ClientReadinessBoardItem[];
  // Office Staff Client Readiness v0.1 — split from the single
  // canManage this component used to take. canManageResidentDocuments-
  // derived; includes office_staff.
  canManageDocuments: boolean;
  // canAccessResidentEvidence-derived, unchanged tier; office_staff
  // excluded. Governs Client Profile/Triage/Medication List/Care
  // Documentation — see ATTESTATION_REQUIREMENT_CODES above.
  canManageAttestations: boolean;
  // canVerifyResidentEvidence, resolved by the caller. office_staff is
  // always false here.
  canVerify: boolean;
  canViewDocuments: boolean;
  initialSelectedCode?: string;
  careContacts: ClientReadinessCareContacts;
  triageDetail: TriageClassificationDetail;
  triageHistory: ResidentTriageClassification[];
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(initialSelectedCode ?? null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialSelectedCode) panelRef.current?.scrollIntoView({ block: "center" });
    // Only ever run on mount for the card this page landed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = items.find((i) => i.requirementCode === selectedCode) ?? null;

  // Settled (satisfied/not-applicable) requirements are visually quieter
  // and compacted below the actionable ones, so the eye lands on the
  // actual work first instead of a wall of equal-weight cards.
  const actionableItems = items.filter((i) => !isSatisfiedStatus(i.status) && i.status !== "not_applicable");
  const settledItems = items.filter((i) => isSatisfiedStatus(i.status) || i.status === "not_applicable");

  return (
    <div>
      {actionableItems.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {actionableItems.map((item) => (
            <RequirementStatusCard
              key={item.requirementCode}
              name={item.requirementName}
              status={item.status}
              explanation={item.explanation}
              ctaLabel={resolveClientReadinessCta(item, careContacts, canManageDocuments, canManageAttestations)}
              isSelected={selectedCode === item.requirementCode}
              onClick={() => setSelectedCode((c) => (c === item.requirementCode ? null : item.requirementCode))}
            />
          ))}
        </div>
      )}

      {settledItems.length > 0 && (
        <div className={actionableItems.length > 0 ? "mt-3 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
          {settledItems.map((item) => (
            <button
              key={item.requirementCode}
              type="button"
              onClick={() => setSelectedCode((c) => (c === item.requirementCode ? null : item.requirementCode))}
              aria-pressed={selectedCode === item.requirementCode}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs transition-colors ${
                selectedCode === item.requirementCode
                  ? "border-navy/30 bg-ivory-warm text-body"
                  : "border-ivory-border bg-ivory text-muted hover:border-navy/20"
              }`}
            >
              <span aria-hidden="true">{item.status === "not_applicable" ? "–" : "✓"}</span>
              {item.requirementName}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div ref={panelRef} className="mt-4 rounded-xl border border-navy/20 bg-ivory-warm p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-sans text-sm font-semibold text-body">{selected.requirementName}</p>
              {selected.regulatoryAuthority && (
                <p className="mt-0.5 font-sans text-xs text-subtle">{selected.regulatoryAuthority}</p>
              )}
              <p className="mt-1 font-sans text-sm text-body">{selected.explanation}</p>
              {selected.evidenceSummary && <p className="mt-1 font-sans text-xs text-muted">{selected.evidenceSummary}</p>}
              {selected.evidenceDocumentId && canViewDocuments && (
                <div className="mt-1">
                  <EvidenceViewButton
                    documentId={selected.evidenceDocumentId}
                    fetchSignedUrl={(documentId) => getResidentDocumentDownloadUrl({ residentId, documentId })}
                  />
                </div>
              )}
            </div>
            <button type="button" onClick={() => setSelectedCode(null)} className="shrink-0 font-sans text-xs text-muted hover:text-body">
              Close ✕
            </button>
          </div>

          <div className="mt-4 border-t border-ivory-border pt-4">
            <RequirementActions
              item={selected}
              residentId={residentId}
              canManageDocuments={canManageDocuments}
              canManageAttestations={canManageAttestations}
              canVerify={canVerify}
              careContacts={careContacts}
              triageDetail={triageDetail}
              triageHistory={triageHistory}
            />
          </div>
        </div>
      )}
    </div>
  );
}
