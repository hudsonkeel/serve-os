import Link from "next/link";
import { CommunityResidentRecord } from "@/lib/data/communityMetrics";

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

  return (
    <div className="flex items-start gap-6 px-6 py-5 transition-colors hover:bg-ivory">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gold-subtle px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-gold-dark">
            {record.serveRelationshipLabel}
          </span>
          {resident.status && (
            <span className="rounded-full bg-ivory-warm px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-muted">
              Resident {titleCase(resident.status)}
            </span>
          )}
          {record.needsReview && (
            <span className="rounded-full bg-ivory-warm px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-muted">
              Review
            </span>
          )}
          {location && (
            <span className="font-sans text-[11px] text-muted">{location}</span>
          )}
        </div>
        <p className="font-sans text-base font-semibold text-navy">
          {record.residentName}
        </p>
        <p className="mt-0.5 font-sans text-xs capitalize text-muted">
          {record.serveRelationshipLabel} | {titleCase(record.residentType)}
        </p>
        {record.needsReview && (
          <p className="mt-1 font-sans text-xs text-muted">
            Needs review: {titleCase(record.needsReview)}
          </p>
        )}
      </div>

      <div className="w-48 shrink-0">
        {contactName ? (
          <>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              Family Contact
            </p>
            <p className="mt-1 font-sans text-sm text-body">{contactName}</p>
            {record.phone && (
              <p className="font-sans text-xs text-muted">
                {formatPhone(record.phone)}
              </p>
            )}
            {!record.phone && record.email && (
              <p className="truncate font-sans text-xs text-muted">{record.email}</p>
            )}
          </>
        ) : (
          <p className="font-sans text-xs text-muted">No contact on file</p>
        )}
      </div>

      <div className="w-44 shrink-0 text-right">
        <p className="mb-2 font-sans text-[11px] text-muted">
          Updated {shortDate(record.updatedAt ?? record.createdAt)}
        </p>
        {record.needsReview && (
          <p className="mb-3 font-sans text-xs text-muted">Next: Review import</p>
        )}
        <Link
          href={`/residents/${record.id}`}
          className="inline-flex items-center rounded-md border border-ivory-border px-3 py-1.5 font-sans text-xs text-body transition-colors hover:border-navy/20 hover:bg-navy hover:text-white"
        >
          View Record
        </Link>
      </div>
    </div>
  );
}
