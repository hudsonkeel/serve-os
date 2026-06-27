import { Prospect } from "@/lib/supabase/types";
import { AlertBadges } from "./AlertBadges";
import { StatusBadge } from "./StatusBadge";
import { WorkflowActions } from "./WorkflowActions";

const SUPPORT_LABELS: Record<string, string> = {
  home_care: "Home Care",
  concierge: "Concierge Support",
  geriatric: "Geriatric Care Management",
  not_sure: "Not sure yet",
};

const TIMING_LABELS: Record<string, string> = {
  immediately: "Immediately",
  coming_weeks: "In the coming weeks",
  future: "Planning for the future",
  not_sure: "Not sure yet",
};

function fullDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReferral(value: string | null) {
  if (!value) return "—";
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Field({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </p>
      <p
        className={`mt-0.5 font-sans text-sm text-body ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

interface ProspectDetailProps {
  prospect: Prospect;
}

export function ProspectDetail({ prospect }: ProspectDetailProps) {
  const residentName =
    [prospect.resident_first_name, prospect.resident_last_name]
      .filter(Boolean)
      .join(" ") || "—";

  const contactName =
    [prospect.contact_first_name, prospect.contact_last_name]
      .filter(Boolean)
      .join(" ") || "—";

  return (
    <div className="border-t border-ivory-border bg-ivory px-8 py-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left: inquiry details */}
        <div className="space-y-6 lg:col-span-2">
          <AlertBadges prospect={prospect} />

          {prospect.care_needs && (
            <div>
              <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                Care Needs
              </p>
              <p className="rounded-lg border border-ivory-border bg-white px-4 py-3 font-sans text-sm leading-relaxed text-body">
                {prospect.care_needs}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Field label="Resident" value={residentName} />
            <Field
              label="Relationship"
              value={prospect.resident_relationship?.replace(/_/g, " ") ?? "—"}
              capitalize
            />
            <Field
              label="Support Type"
              value={
                prospect.support_type
                  ? (SUPPORT_LABELS[prospect.support_type] ??
                    prospect.support_type)
                  : "—"
              }
            />
            <Field
              label="Start Timing"
              value={
                prospect.start_timing
                  ? (TIMING_LABELS[prospect.start_timing] ??
                    prospect.start_timing)
                  : "—"
              }
            />
            <Field
              label="Referral Source"
              value={formatReferral(prospect.referral_source)}
            />
            <Field label="ZIP Code" value={prospect.zip_code ?? "—"} />
          </div>
        </div>

        {/* Right: contact + status + meta */}
        <div className="space-y-6">
          <div>
            <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              Contact
            </p>
            <p className="font-sans text-sm font-medium text-body">
              {contactName}
            </p>
            {prospect.contact_phone && (
              <a
                href={`tel:${prospect.contact_phone}`}
                className="mt-1 block font-sans text-sm text-navy underline-offset-2 hover:underline"
              >
                {prospect.contact_phone}
              </a>
            )}
            {prospect.contact_email && (
              <a
                href={`mailto:${prospect.contact_email}`}
                className="block break-all font-sans text-sm text-navy underline-offset-2 hover:underline"
              >
                {prospect.contact_email}
              </a>
            )}
            {!prospect.contact_phone && !prospect.contact_email && (
              <p className="mt-1 font-sans text-xs text-muted">
                No contact info on file
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              Status
            </p>
            <StatusBadge status={prospect.status} />
          </div>

          <div>
            <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              Actions
            </p>
            <WorkflowActions
              id={prospect.id}
              currentStatus={prospect.status}
              variant="buttons"
            />
          </div>

          <div>
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              Received
            </p>
            <p className="font-sans text-xs text-body">
              {fullDate(prospect.created_at)}
            </p>
          </div>

          {prospect.source && (
            <div>
              <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                Source
              </p>
              <p className="font-sans text-xs capitalize text-body">
                {prospect.source.replace(/_/g, " ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
