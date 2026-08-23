"use client";

import { useEffect, useRef, useState } from "react";
import { RequirementStatusCard, resolveStatusCardCta } from "@/components/compliance/AttentionCard";
import { EvidenceViewButton } from "@/components/compliance/EvidenceViewButton";
import { DocumentEvidenceForm } from "@/components/clientReadiness/DocumentEvidenceForm";
import { ClientProfileRemediationForm } from "@/components/clientReadiness/ClientProfileRemediationForm";
import { ServiceAgreementEvidenceForm } from "@/components/clientReadiness/ServiceAgreementEvidenceForm";
import { MedicationListAttestationForm } from "@/components/clientReadiness/MedicationListAttestationForm";
import { CareDocumentationAttestationForm } from "@/components/clientReadiness/CareDocumentationAttestationForm";
import { TriageClassificationControl } from "@/components/clientReadiness/TriageClassificationControl";
import type { TriageClassificationDetail } from "@/lib/clientReadiness/triageClassificationDetail";
import type { ResidentTriageClassification } from "@/lib/data/residentTriageClassifications";
import {
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
}

function isSatisfiedStatus(status: AuditReadinessStatus): boolean {
  return status === "compliant" || status === "satisfied_by_event" || status === "exception";
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

function resolveClientReadinessCta(item: ClientReadinessBoardItem, careContacts: ClientReadinessCareContacts): string {
  if (isSatisfiedStatus(item.status)) return "View Evidence →";
  if (item.status === "not_applicable") return "View Requirement →";

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
function RequirementActions({
  item,
  residentId,
  canManage,
  careContacts,
  triageDetail,
  triageHistory,
}: {
  item: ClientReadinessBoardItem;
  residentId: string;
  canManage: boolean;
  careContacts: ClientReadinessCareContacts;
  triageDetail: TriageClassificationDetail;
  triageHistory: ResidentTriageClassification[];
}) {
  if (!canManage) return null;

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
  canManage,
  canViewDocuments,
  initialSelectedCode,
  careContacts,
  triageDetail,
  triageHistory,
}: {
  residentId: string;
  items: ClientReadinessBoardItem[];
  canManage: boolean;
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
              ctaLabel={resolveClientReadinessCta(item, careContacts)}
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
                  <EvidenceViewButton documentId={selected.evidenceDocumentId} />
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
              canManage={canManage}
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
