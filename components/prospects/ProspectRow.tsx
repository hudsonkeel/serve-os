import { Prospect } from "@/lib/supabase/types";
import { StatusBadge } from "./StatusBadge";
import { WorkflowActions } from "./WorkflowActions";

const SUPPORT_SHORT: Record<string, string> = {
  home_care: "Home Care",
  concierge: "Concierge",
  geriatric: "Geriatric Mgmt",
  not_sure: "Not Sure",
};

const TIMING_SHORT: Record<string, string> = {
  immediately: "Immediately",
  coming_weeks: "Coming Weeks",
  future: "Future",
  not_sure: "Not Sure",
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortReferral(value: string | null) {
  if (!value) return "—";
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface ProspectRowProps {
  prospect: Prospect;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ProspectRow({
  prospect,
  isExpanded,
  onToggle,
}: ProspectRowProps) {
  const isHighPriority = prospect.start_timing === "immediately";
  const isMissingContact = !prospect.contact_phone && !prospect.contact_email;
  const isWebsite = prospect.source === "website_intake";

  const prospectName =
    [
      prospect.care_recipient_first_name ?? prospect.resident_first_name,
      prospect.care_recipient_last_name ?? prospect.resident_last_name,
    ]
      .filter(Boolean)
      .join(" ") || "—";

  const contactName =
    [prospect.contact_first_name, prospect.contact_last_name]
      .filter(Boolean)
      .join(" ") || "—";

  return (
    <div
      className={`prospect-inbox-grid grid items-center gap-x-4 px-5 py-3.5 transition-colors hover:bg-ivory ${
        isExpanded ? "bg-ivory" : ""
      }`}
    >
      {/* Flags — colored dots */}
      <div className="flex items-center gap-1.5">
        {isHighPriority && (
          <span
            title="High Priority"
            className="inline-block h-2 w-2 rounded-full bg-red-500"
          />
        )}
        {isMissingContact && (
          <span
            title="Missing Contact Info"
            className="inline-block h-2 w-2 rounded-full bg-amber-400"
          />
        )}
        {isWebsite && (
          <span
            title="New Website Inquiry"
            className="inline-block h-2 w-2 rounded-full bg-blue-400"
          />
        )}
      </div>

      {/* Prospect */}
      <div className="min-w-0">
        <p className="truncate font-sans text-sm font-medium text-body">
          {prospectName}
        </p>
        {prospect.resident_relationship && (
          <p className="truncate font-sans text-[11px] capitalize text-muted">
            {prospect.resident_relationship.replace(/_/g, " ")}
          </p>
        )}
      </div>

      {/* Contact */}
      <div className="min-w-0">
        <p className="truncate font-sans text-sm text-body">{contactName}</p>
        <p className="truncate font-sans text-[11px] text-muted">
          {prospect.contact_phone
            ? prospect.contact_phone
            : prospect.contact_email
            ? prospect.contact_email
            : "No contact info"}
        </p>
      </div>

      {/* Support type */}
      <p className="truncate font-sans text-xs text-body">
        {prospect.support_type
          ? (SUPPORT_SHORT[prospect.support_type] ?? prospect.support_type)
          : "—"}
      </p>

      {/* Start timing */}
      <p className="truncate font-sans text-xs text-body">
        {prospect.start_timing
          ? (TIMING_SHORT[prospect.start_timing] ?? prospect.start_timing)
          : "—"}
      </p>

      {/* Referral */}
      <p className="truncate font-sans text-xs text-body">
        {shortReferral(prospect.referral_source)}
      </p>

      {/* Status — read-only badge */}
      <StatusBadge status={prospect.status} />

      {/* Workflow actions */}
      <WorkflowActions id={prospect.id} currentStatus={prospect.status} variant="menu" />

      {/* Date */}
      <p className="font-sans text-xs text-muted">{shortDate(prospect.created_at)}</p>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isExpanded ? "Hide details" : "View details"}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-ivory-border font-sans text-[11px] text-muted transition-colors hover:border-gold/50 hover:text-gold"
      >
        {isExpanded ? "▲" : "▼"}
      </button>
    </div>
  );
}
