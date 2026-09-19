"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmImportantPersonProposal,
  type ImportantPeopleReviewData,
  type ImportantPersonProposalView,
} from "@/lib/actions/importantPeople";
import { Badge } from "@/components/ui/Badge";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui/actionButtonStyles";

// Slice C.3's focused Important People panel — NOT the full Client Onboarding workspace (C.4).
// Deliberately narrow: propose from the most recent approved assessment, let a human confirm
// with minimal clicks, show current canonical people. See lib/actions/importantPeople.ts's own
// header comment for the assessment-approval boundary this respects and the ambiguous-match
// reconciliation flow this slice deliberately does not build yet.

const ROLE_LABELS: Record<string, string> = {
  primary_contact: "Primary Contact",
  decision_maker: "Decision Maker",
  emergency_contact: "Emergency Contact",
  medical_poa: "Medical POA",
  financial_poa: "Financial POA",
  guardian: "Guardian",
};

const AUTHORITY_ROLE_TYPES = new Set(["medical_poa", "financial_poa", "guardian"]);

function isRelationshipRole(roleType: string): boolean {
  return roleType.startsWith("relationship:");
}

function relationshipLabel(roleType: string): string {
  return roleType.slice("relationship:".length);
}

function operationalRoleLabel(roleType: string): string {
  return ROLE_LABELS[roleType] ?? roleType;
}

function PersonRolePills({ roles }: { roles: readonly { roleType: string }[] }) {
  const operational = roles.filter((r) => !isRelationshipRole(r.roleType));
  if (operational.length === 0) return null;
  return (
    <p className="mt-1 font-sans text-sm text-body">
      {operational.map((r) => operationalRoleLabel(r.roleType)).join(" · ")}
    </p>
  );
}

function AuthorityRoleStatus({ roleType, status }: { roleType: string; status: string }) {
  // Never a green "verified" treatment merely because the assessment said so — status here is
  // always exactly what contact_roles.status actually is; this component draws no inference of
  // its own.
  const verified = status === "verified";
  return (
    <p className="mt-1 flex items-center gap-2 font-sans text-sm text-body">
      <span>{operationalRoleLabel(roleType)}</span>
      <Badge tone={verified ? "success" : "neutral"}>{verified ? "Verified" : "Reported / not yet verified"}</Badge>
    </p>
  );
}

export function ImportantPeoplePanel({
  residentId,
  initialData,
  canEdit,
}: {
  residentId: string;
  initialData: ImportantPeopleReviewData;
  /** Mirrors the same canEditResidentProfile() gate the confirm server action itself enforces
   * (lib/actions/importantPeople.ts's requireActor()) — this only controls whether the button
   * renders at all; it is never the actual authorization boundary. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  function handleConfirm(proposal: ImportantPersonProposalView) {
    setError(null);
    setConfirmingKey(proposal.proposalKey);
    startTransition(async () => {
      const decision =
        proposal.linkDecision.action === "link_existing" && proposal.linkDecision.matchedContactId
          ? { type: "link_existing" as const, contactId: proposal.linkDecision.matchedContactId }
          : { type: "create_new" as const };
      const result = await confirmImportantPersonProposal({
        residentId,
        decision,
        firstName: proposal.firstName,
        lastName: proposal.lastName,
        phone: proposal.phone,
        nameSourceApprovedFactId: proposal.nameSourceApprovedFactId,
        phoneSourceApprovedFactId: proposal.phoneSourceApprovedFactId,
        roles: proposal.roles,
      });
      setConfirmingKey(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      // The resident page (Server Component) re-fetches getImportantPeopleReviewData() and
      // passes fresh initialData back down -- same refresh convention as
      // AssessmentReviewPanel.tsx. This is what moves a just-confirmed proposal out of
      // "Proposed from assessment" and into "Current Important People": it is no longer
      // unresolved (partitionProposalsByResolution), so the next render simply doesn't include
      // it in `proposals` at all.
      router.refresh();
    });
  }

  const { proposals, currentPeople, unattachedPoaClaims } = initialData;

  if (proposals.length === 0 && currentPeople.length === 0 && unattachedPoaClaims.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-muted">Important People</h3>

      {currentPeople.length > 0 && (
        <div className="mb-4 space-y-3">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-muted">Current Important People</p>
          {currentPeople.map((person) => (
            <div key={person.contactId} className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
              <p className="font-sans text-base font-semibold text-body">
                {[person.firstName, person.lastName].filter(Boolean).join(" ") || "(name not on file)"}
              </p>
              {person.roles.filter((r) => isRelationshipRole(r.roleType)).map((r) => (
                <p key={r.roleType} className="font-sans text-sm text-muted">
                  {relationshipLabel(r.roleType)}
                </p>
              ))}
              <PersonRolePills roles={person.roles.filter((r) => !AUTHORITY_ROLE_TYPES.has(r.roleType))} />
              {person.roles
                .filter((r) => AUTHORITY_ROLE_TYPES.has(r.roleType))
                .map((r) => (
                  <AuthorityRoleStatus key={r.roleType} roleType={r.roleType} status={r.status} />
                ))}
              {person.phone && <p className="mt-1 font-sans text-sm text-body">{person.phone}</p>}
            </div>
          ))}
        </div>
      )}

      {proposals.length > 0 && (
        <div className="space-y-3">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-muted">Proposed from assessment</p>
          {proposals.map((proposal) => {
            const relationshipRoles = proposal.roles.filter((r) => isRelationshipRole(r.roleType));
            const operationalRoles = proposal.roles.filter(
              (r) => !isRelationshipRole(r.roleType) && !AUTHORITY_ROLE_TYPES.has(r.roleType)
            );
            const authorityRoles = proposal.roles.filter((r) => AUTHORITY_ROLE_TYPES.has(r.roleType));
            const needsReconciliation = proposal.linkDecision.action === "requires_reconciliation";
            const isLinking = proposal.linkDecision.action === "link_existing";

            return (
              <div key={proposal.proposalKey} className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
                <p className="font-sans text-base font-semibold text-body">{proposal.rawFullName}</p>
                {relationshipRoles.map((r) => (
                  <p key={r.roleType} className="font-sans text-sm text-muted">
                    {relationshipLabel(r.roleType)}
                  </p>
                ))}
                {operationalRoles.length > 0 && (
                  <p className="mt-1 font-sans text-sm text-body">
                    {operationalRoles.map((r) => operationalRoleLabel(r.roleType)).join(" · ")}
                  </p>
                )}
                {authorityRoles.map((r) => (
                  <p key={r.roleType} className="mt-1 font-sans text-sm text-body">
                    {operationalRoleLabel(r.roleType)} <span className="text-muted">(reported, not yet verified)</span>
                  </p>
                ))}
                {proposal.phone && <p className="mt-1 font-sans text-sm text-body">{proposal.phone}</p>}
                <p className="mt-2 font-sans text-xs text-muted">From approved assessment</p>

                {needsReconciliation ? (
                  <p className="mt-3 font-sans text-xs text-warning-text">
                    This may match an existing contact — needs manual review before it can be added.
                  </p>
                ) : (
                  canEdit && (
                    <button
                      type="button"
                      onClick={() => handleConfirm(proposal)}
                      disabled={isPending && confirmingKey === proposal.proposalKey}
                      className={`${PRIMARY_BUTTON_CLASS} mt-3`}
                    >
                      {isPending && confirmingKey === proposal.proposalKey
                        ? "Adding…"
                        : isLinking
                          ? "Confirm — same as existing contact"
                          : "Add to Important People"}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {unattachedPoaClaims.length > 0 && (
        <p className="mt-3 font-sans text-xs text-muted">
          The assessment also reported {unattachedPoaClaims.length === 1 ? "a" : unattachedPoaClaims.length}{" "}
          power of attorney but did not identify a specific decision maker to attach it to.
        </p>
      )}

      {error && <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}
