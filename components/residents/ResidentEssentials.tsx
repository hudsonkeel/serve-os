"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { FamilyContactsCard } from "@/components/residents/FamilyContactsCard";
import { CareContactsCard } from "@/components/residents/CareContactsCard";
import type { AuditReadinessStatus } from "@/lib/compliance/auditReadinessStatus";

// Section D — "Essential client details." One compact definition list
// replacing what used to be four separate cards (Family Contact,
// Physician/Guardian, Care Snapshot, Resident Profile basics). Editing
// reuses the existing FamilyContactsCard/CareContactsCard forms as-is
// (same server actions, same validation) — this component only changes
// how they're presented at rest, via a small additive startInEditMode
// prop on each.

function formatPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone || null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

function isSatisfiedStatus(status: AuditReadinessStatus | undefined): boolean {
  return status === "compliant" || status === "satisfied_by_event" || status === "exception";
}

function readinessLabel(status: AuditReadinessStatus | undefined): string {
  if (!status || status === "not_applicable") return "N/A";
  return isSatisfiedStatus(status) ? "Current" : "Missing";
}

function Row({
  label,
  value,
  badgeTone,
  onEdit,
  href,
  hrefLabel,
}: {
  label: string;
  value?: string;
  badgeTone?: BadgeTone;
  onEdit?: () => void;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <span className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">{label}</span>
        <span className="mx-2 text-subtle">—</span>
        {badgeTone ? (
          <Badge tone={badgeTone}>{value}</Badge>
        ) : (
          <span className="font-sans text-sm text-body">{value}</span>
        )}
      </div>
      <div className="shrink-0">
        {onEdit && (
          <button type="button" onClick={onEdit} className="font-sans text-xs font-medium text-navy hover:text-navy-light">
            Edit
          </button>
        )}
        {href && (
          <Link href={href} className="font-sans text-xs font-medium text-navy hover:text-navy-light">
            {hrefLabel ?? "View"} →
          </Link>
        )}
      </div>
    </div>
  );
}

interface ResidentEssentialsProps {
  residentId: string;
  canEdit: boolean;
  contactName: string;
  contactRelationship: string;
  contactPhone: string;
  contactEmail: string;
  physicianName: string;
  physicianPhone: string;
  guardianName: string;
  guardianPhone: string;
  guardianConfirmedNone: boolean;
  currentNeedsContent: string | null;
  assessmentStatus: AuditReadinessStatus | undefined;
  ispStatus: AuditReadinessStatus | undefined;
  residentPageHref: string;
}

type EditingTarget = "contact" | "care" | null;

export function ResidentEssentials({
  residentId,
  canEdit,
  contactName,
  contactRelationship,
  contactPhone,
  contactEmail,
  physicianName,
  physicianPhone,
  guardianName,
  guardianPhone,
  guardianConfirmedNone,
  currentNeedsContent,
  assessmentStatus,
  ispStatus,
  residentPageHref,
}: ResidentEssentialsProps) {
  const [editing, setEditing] = useState<EditingTarget>(null);

  const contactValue = contactName
    ? [contactName, formatPhone(contactPhone)].filter(Boolean).join(" · ")
    : "Not on file";
  const physicianValue = physicianName
    ? [physicianName, formatPhone(physicianPhone)].filter(Boolean).join(" · ")
    : "Not on file";
  const guardianValue = guardianName
    ? [guardianName, formatPhone(guardianPhone)].filter(Boolean).join(" · ")
    : guardianConfirmedNone
      ? "Confirmed — none"
      : "Not confirmed";
  const currentNeedsValue = currentNeedsContent ? truncate(currentNeedsContent, 140) : "Not recorded yet";

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-5">
      <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Care &amp; Contacts</p>

      {editing === "contact" && (
        <div className="mb-4 rounded-lg border border-ivory-border bg-ivory p-4">
          <FamilyContactsCard
            residentId={residentId}
            canEdit={canEdit}
            initialContactName={contactName}
            initialRelationship={contactRelationship}
            initialPhone={contactPhone}
            initialEmail={contactEmail}
            startInEditMode
          />
          <button type="button" onClick={() => setEditing(null)} className="mt-3 font-sans text-xs text-muted hover:text-body">
            Close
          </button>
        </div>
      )}

      {editing === "care" && (
        <div className="mb-4 rounded-lg border border-ivory-border bg-ivory p-4">
          <CareContactsCard
            residentId={residentId}
            canEdit={canEdit}
            initialPhysicianName={physicianName}
            initialPhysicianPhone={physicianPhone}
            initialGuardianName={guardianName}
            initialGuardianPhone={guardianPhone}
            guardianConfirmedNone={guardianConfirmedNone}
            startInEditMode
          />
          <button type="button" onClick={() => setEditing(null)} className="mt-3 font-sans text-xs text-muted hover:text-body">
            Close
          </button>
        </div>
      )}

      <div className="divide-y divide-ivory-border">
        {editing !== "contact" && (
          <Row label="Emergency Contact" value={contactValue} onEdit={canEdit ? () => setEditing("contact") : undefined} />
        )}
        {editing !== "care" && (
          <>
            <Row label="Physician" value={physicianValue} onEdit={canEdit ? () => setEditing("care") : undefined} />
            <Row label="Guardian" value={guardianValue} onEdit={canEdit ? () => setEditing("care") : undefined} />
          </>
        )}
        <Row label="Current Needs" value={currentNeedsValue} href={`${residentPageHref}#current-needs`} hrefLabel="Edit" />
        <Row
          label="Assessment"
          value={readinessLabel(assessmentStatus)}
          badgeTone={isSatisfiedStatus(assessmentStatus) ? "success" : "neutral"}
          href={`${residentPageHref}?requirement=CR_ASSESSMENT_CURRENT`}
          hrefLabel="View"
        />
        <Row
          label="ISP"
          value={readinessLabel(ispStatus)}
          badgeTone={isSatisfiedStatus(ispStatus) ? "success" : "neutral"}
          href={`${residentPageHref}?requirement=CR_ISP_ON_FILE_AND_CURRENT`}
          hrefLabel="View"
        />
      </div>
    </div>
  );
}
