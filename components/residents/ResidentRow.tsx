import Link from "next/link";
import { CommunityResidentRecord } from "@/lib/data/communityMetrics";
import { StatusBadge } from "@/components/prospects/StatusBadge";

const SUPPORT_SHORT: Record<string, string> = {
  home_care: "Home Care",
  concierge: "Concierge Support",
  geriatric: "Geriatric Care Mgmt",
  not_sure: "Care type TBD",
};

const TIMING_SHORT: Record<string, string> = {
  immediately: "Immediate need",
  coming_weeks: "In coming weeks",
  future: "Planning ahead",
  not_sure: "Timing TBD",
};

const NEXT_ACTION: Record<string, string> = {
  new: "Review inquiry",
  reviewing: "Log contact attempt",
  contacted: "Schedule assessment",
  assessment_scheduled: "Complete assessment",
  converted: "Manage care plan",
  closed: "No action needed",
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface ResidentRowProps {
  record: CommunityResidentRecord;
}

export function ResidentRow({ record }: ResidentRowProps) {
  const { prospect } = record;
  const contactName =
    record.familyContact === "No contact on file" ? null : record.familyContact;
  const community =
    (prospect.raw_submission as Record<string, string> | null)?.community ?? null;

  const isForSomeoneElse =
    prospect.resident_relationship &&
    prospect.resident_relationship !== "myself";

  const supportLine = [
    record.supportType ? SUPPORT_SHORT[record.supportType] : null,
    record.startTiming ? TIMING_SHORT[record.startTiming] : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const nextAction = NEXT_ACTION[prospect.status];

  return (
    <div className="flex items-start gap-6 px-6 py-5 transition-colors hover:bg-ivory">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={prospect.status} />
          {community && (
            <span className="font-sans text-[11px] capitalize text-muted">
              {community.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <p className="font-sans text-base font-semibold text-navy">
          {record.residentName}
        </p>
        {isForSomeoneElse && (
          <p className="mt-0.5 font-sans text-xs capitalize text-muted">
            Inquiring on behalf of {prospect.resident_relationship?.replace(/_/g, " ")}
          </p>
        )}
        {supportLine && (
          <p className="mt-1 font-sans text-xs text-muted">{supportLine}</p>
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
              <p className="font-sans text-xs text-muted">{record.phone}</p>
            )}
            {!record.phone && record.email && (
              <p className="truncate font-sans text-xs text-muted">{record.email}</p>
            )}
          </>
        ) : (
          <p className="font-sans text-xs text-muted">No contact on file</p>
        )}
        {record.referralSource && (
          <p className="mt-2 font-sans text-[11px] text-muted">
            via{" "}
            {record.referralSource
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")}
          </p>
        )}
      </div>

      <div className="w-44 shrink-0 text-right">
        <p className="mb-2 font-sans text-[11px] text-muted">
          {shortDate(record.createdAt)}
        </p>
        {nextAction && nextAction !== "No action needed" && (
          <p className="mb-3 font-sans text-xs text-muted">
            Next: {nextAction}
          </p>
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
