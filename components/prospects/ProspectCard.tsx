import { Prospect } from "@/lib/supabase/types";
import { AlertBadges } from "./AlertBadges";
import { StatusDropdown } from "./StatusDropdown";

interface ProspectCardProps {
  prospect: Prospect;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTiming(value: string | null) {
  const map: Record<string, string> = {
    immediately: "Immediately",
    coming_weeks: "In the coming weeks",
    future: "Planning for the future",
    not_sure: "Not sure yet",
  };
  return value ? (map[value] ?? value) : "—";
}

function formatSupportType(value: string | null) {
  const map: Record<string, string> = {
    home_care: "Home Care",
    concierge: "Concierge Support",
    geriatric: "Geriatric Care Management",
    not_sure: "Not sure yet",
  };
  return value ? (map[value] ?? value) : "—";
}

function formatReferral(value: string | null) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ProspectCard({ prospect }: ProspectCardProps) {
  const prospectName =
    [
      prospect.care_recipient_first_name ?? prospect.resident_first_name,
      prospect.care_recipient_last_name ?? prospect.resident_last_name,
    ]
      .filter(Boolean)
      .join(" ") || "—";

  const contactName = [prospect.contact_first_name, prospect.contact_last_name]
    .filter(Boolean)
    .join(" ") || "—";

  return (
    <div className="rounded-xl border border-ivory-border bg-white shadow-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-ivory-border px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <AlertBadges prospect={prospect} />
          <p className="font-sans text-[11px] text-muted">
            Received {formatDate(prospect.created_at)}
          </p>
        </div>
        <StatusDropdown id={prospect.id} status={prospect.status} />
      </div>

      {/* Body — 3 columns */}
      <div className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-3">
        {/* Prospect */}
        <div>
          <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
            Prospect
          </p>
          <p className="font-sans text-sm font-medium text-body">{prospectName}</p>
          {prospect.resident_relationship && (
            <p className="mt-0.5 font-sans text-xs text-muted capitalize">
              {prospect.resident_relationship.replace(/_/g, " ")}
            </p>
          )}
        </div>

        {/* Contact */}
        <div>
          <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
            Contact
          </p>
          <p className="font-sans text-sm font-medium text-body">{contactName}</p>
          {prospect.contact_phone && (
            <p className="mt-0.5 font-sans text-xs text-muted">{prospect.contact_phone}</p>
          )}
          {prospect.contact_email && (
            <p className="font-sans text-xs text-muted">{prospect.contact_email}</p>
          )}
          {!prospect.contact_phone && !prospect.contact_email && (
            <p className="mt-0.5 font-sans text-xs text-muted">No contact info</p>
          )}
        </div>

        {/* Inquiry */}
        <div>
          <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
            Inquiry
          </p>
          <p className="font-sans text-xs text-body">
            <span className="font-medium">Support:</span>{" "}
            {formatSupportType(prospect.support_type)}
          </p>
          <p className="mt-0.5 font-sans text-xs text-body">
            <span className="font-medium">Timing:</span>{" "}
            {formatTiming(prospect.start_timing)}
          </p>
          <p className="mt-0.5 font-sans text-xs text-body">
            <span className="font-medium">Referred by:</span>{" "}
            {formatReferral(prospect.referral_source)}
          </p>
        </div>
      </div>
    </div>
  );
}
