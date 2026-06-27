import Link from "next/link";
import { Prospect } from "@/lib/supabase/types";
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
  prospect: Prospect;
}

export function ResidentRow({ prospect }: ResidentRowProps) {
  const residentName =
    [prospect.resident_first_name, prospect.resident_last_name]
      .filter(Boolean)
      .join(" ") || "Unknown Resident";

  const contactName =
    [prospect.contact_first_name, prospect.contact_last_name]
      .filter(Boolean)
      .join(" ") || null;

  const community =
    (prospect.raw_submission as Record<string, string> | null)?.community ?? null;

  const isForSomeoneElse =
    prospect.resident_relationship &&
    prospect.resident_relationship !== "myself";

  const supportLine = [
    prospect.support_type ? SUPPORT_SHORT[prospect.support_type] : null,
    prospect.start_timing ? TIMING_SHORT[prospect.start_timing] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const nextAction = NEXT_ACTION[prospect.status];

  return (
    <div className="flex items-start gap-6 px-6 py-5 transition-colors hover:bg-ivory">
      {/* ─── Identity ─── */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={prospect.status} />
          {community && (
            <span className="font-sans text-[11px] capitalize text-muted">
              {community.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <p className="font-sans text-base font-semibold text-navy">{residentName}</p>
        {isForSomeoneElse && (
          <p className="mt-0.5 font-sans text-xs capitalize text-muted">
            Inquiring on behalf of {prospect.resident_relationship?.replace(/_/g, " ")}
          </p>
        )}
        {supportLine && (
          <p className="mt-1 font-sans text-xs text-muted">{supportLine}</p>
        )}
      </div>

      {/* ─── Family Contact ─── */}
      <div className="w-48 shrink-0">
        {contactName ? (
          <>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              Family Contact
            </p>
            <p className="mt-1 font-sans text-sm text-body">{contactName}</p>
            {prospect.contact_phone && (
              <p className="font-sans text-xs text-muted">{prospect.contact_phone}</p>
            )}
            {!prospect.contact_phone && prospect.contact_email && (
              <p className="truncate font-sans text-xs text-muted">{prospect.contact_email}</p>
            )}
          </>
        ) : (
          <p className="font-sans text-xs text-muted">No contact on file</p>
        )}
        {prospect.referral_source && (
          <p className="mt-2 font-sans text-[11px] text-muted">
            via{" "}
            {prospect.referral_source
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")}
          </p>
        )}
      </div>

      {/* ─── Action + Date ─── */}
      <div className="w-44 shrink-0 text-right">
        <p className="mb-2 font-sans text-[11px] text-muted">
          {shortDate(prospect.created_at)}
        </p>
        {nextAction && nextAction !== "No action needed" && (
          <p className="mb-3 font-sans text-xs text-muted">
            Next: {nextAction}
          </p>
        )}
        <Link
          href={`/residents/${prospect.id}`}
          className="inline-flex items-center rounded-md border border-ivory-border px-3 py-1.5 font-sans text-xs text-body transition-colors hover:border-navy/20 hover:bg-navy hover:text-white"
        >
          View Resident →
        </Link>
      </div>
    </div>
  );
}
