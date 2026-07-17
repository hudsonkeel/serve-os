import Link from "next/link";
import { CommunityResidentRecord } from "@/lib/data/communityMetrics";
import { RELATIONSHIP_STAGE_LABELS } from "@/lib/relationships/constants";
import { Badge } from "@/components/ui/Badge";

function shortDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function titleCase(value: string | null) {
  if (!value) return "-";
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

interface ResidentRowProps {
  record: CommunityResidentRecord;
}

export function ResidentRow({ record }: ResidentRowProps) {
  const resident = record.resident;
  const contactName =
    record.familyContact === "No contact on file" ? null : record.familyContact;
  const location = [
    record.unitNumber ? `Unit ${record.unitNumber}` : null,
    record.building,
  ]
    .filter(Boolean)
    .join(" | ");
  const primaryRelationship = record.activeRelationships[0] ?? null;

  return (
    // "Stretched link" card: the row-opens-resident Link is an absolutely
    // positioned overlay sibling, not a parent, of the row's content — so
    // the independently-clickable "Open Relationship" link below can sit
    // in the same row without ever nesting one <a> inside another (invalid
    // HTML that browsers resolve inconsistently). Content wrapped
    // pointer-events-none so clicks fall through to the overlay by
    // default; the Relationship link opts back in with pointer-events-auto
    // and a higher z-index.
    <div className="relative flex items-start gap-6 px-6 py-6 transition-colors hover:bg-ivory">
      <Link
        href={`/residents/${record.id}`}
        aria-label={`Open resident record for ${record.residentDisplayName}`}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
        className="absolute inset-0 z-0 focus:outline-none focus-visible:bg-ivory focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/40"
      />

      <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {record.serveRelationshipStatus !== "none" && (
            <Badge tone="gold">{record.serveRelationshipLabel}</Badge>
          )}
          {resident.status && (
            <Badge>Resident {titleCase(resident.status)}</Badge>
          )}
          {record.needsReview && <Badge tone="warning">Review</Badge>}
          {location && (
            <span className="font-sans text-sm text-muted">{location}</span>
          )}
        </div>
        <p className="font-sans text-card-title font-semibold text-body">
          {record.residentDisplayName}
        </p>
        {record.serveRelationshipStatus !== "none" && (
          <p className="mt-0.5 font-sans text-sm capitalize text-muted">
            {record.serveRelationshipLabel} | {titleCase(record.residentType)}
          </p>
        )}
        {record.needsReview && (
          <p className="mt-1 font-sans text-sm text-muted">
            Needs review: {titleCase(record.needsReview)}
          </p>
        )}
        {record.wellnessWatch && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={record.wellnessWatch.hasOverdue ? "danger" : "warning"}>
              {record.wellnessWatch.hasOverdue ? "Wellness Watch — Overdue" : "Wellness Watch"}
            </Badge>
            <span className="font-sans text-sm leading-relaxed text-muted">
              {record.wellnessWatch.openCount === 1
                ? "1 open follow-up"
                : `${record.wellnessWatch.openCount} open follow-ups`}
              {record.wellnessWatch.nearestDueAt &&
                ` · Due ${shortDate(record.wellnessWatch.nearestDueAt)}`}
              {" · "}
              {titleCase(record.wellnessWatch.highestPriority)} priority
              {record.lastWellnessObservedAt &&
                ` · Last observed ${shortDate(record.lastWellnessObservedAt)}`}
            </span>
          </div>
        )}
        {primaryRelationship && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/relationships/${primaryRelationship.id}`}
              className="pointer-events-auto relative z-[2] font-sans text-sm font-medium text-navy hover:text-navy-light"
            >
              Relationship: {RELATIONSHIP_STAGE_LABELS[primaryRelationship.stage]}
            </Link>
            <span className="font-sans text-sm text-muted">
              {primaryRelationship.nearestActionTitle
                ? `Next: ${primaryRelationship.nearestActionTitle}${
                    primaryRelationship.nearestActionDueAt
                      ? ` · ${shortDate(primaryRelationship.nearestActionDueAt)}`
                      : ""
                  }`
                : "No next action"}
              {record.activeRelationships.length > 1 &&
                ` · +${record.activeRelationships.length - 1} more`}
            </span>
          </div>
        )}
      </div>

      <div className="pointer-events-none relative z-[1] w-48 shrink-0">
        {contactName ? (
          <>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Family Contact
            </p>
            <p className="mt-1 font-sans text-base text-body">{contactName}</p>
            {record.phone && (
              <p className="font-sans text-sm text-muted">
                {formatPhone(record.phone)}
              </p>
            )}
            {!record.phone && record.email && (
              <p className="truncate font-sans text-sm text-muted">{record.email}</p>
            )}
          </>
        ) : (
          <p className="font-sans text-sm text-muted">No contact on file</p>
        )}
      </div>

      <div className="pointer-events-none relative z-[1] w-44 shrink-0 space-y-1 text-right">
        <p className="font-sans text-sm text-muted">
          Updated {shortDate(record.updatedAt ?? record.createdAt)}
        </p>
        {record.needsReview && (
          <p className="font-sans text-sm text-muted">Next: Review import</p>
        )}
      </div>
    </div>
  );
}
