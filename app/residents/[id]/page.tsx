import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityResidentById } from "@/lib/data/communityMetrics";
import { PageContainer } from "@/components/PageContainer";
import { StatusBadge } from "@/components/prospects/StatusBadge";
import { WorkflowActions } from "@/components/prospects/WorkflowActions";

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
  if (!value) return "-";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ivory-border bg-white p-6 shadow-card">
      <h3 className="mb-4 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
        {title}
      </h3>
      {children}
    </div>
  );
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
      <p className={`mt-0.5 font-sans text-sm text-body ${capitalize ? "capitalize" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function PlaceholderSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-ivory-border bg-white p-6">
      <h3 className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
        {title}
      </h3>
      <p className="font-sans text-xs text-muted">{description}</p>
    </div>
  );
}

export default async function ResidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getCommunityResidentById(id);

  if (!record) notFound();

  const prospect = record.prospect;
  const contactName =
    record.familyContact === "No contact on file" ? "-" : record.familyContact;

  return (
    <PageContainer title={record.residentName}>
      <div className="mb-6">
        <Link
          href="/residents"
          className="font-sans text-xs text-muted transition-colors hover:text-body"
        >
          Back to Residents
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-4xl font-light text-navy">
            {record.residentName}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <StatusBadge status={prospect.status} />
            <span className="font-sans text-xs text-muted">
              Received {fullDate(record.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Resident Profile">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Full Name" value={record.residentName} />
              <Field
                label="Relationship to Contact"
                value={prospect.resident_relationship?.replace(/_/g, " ") ?? "-"}
                capitalize
              />
              <Field label="ZIP Code" value={prospect.zip_code ?? "-"} />
              <Field
                label="Inquiry Type"
                value={prospect.inquiry_type?.replace(/_/g, " ") ?? "-"}
                capitalize
              />
            </div>
          </Section>

          <Section title="Family Contacts">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Contact Name" value={contactName} />
                <Field
                  label="Relationship"
                  value={prospect.resident_relationship?.replace(/_/g, " ") ?? "-"}
                  capitalize
                />
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Phone
                  </p>
                  {record.phone ? (
                    <a
                      href={`tel:${record.phone}`}
                      className="mt-0.5 block font-sans text-sm text-navy underline-offset-2 hover:underline"
                    >
                      {record.phone}
                    </a>
                  ) : (
                    <p className="mt-0.5 font-sans text-sm text-subtle">-</p>
                  )}
                </div>
                <div>
                  <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Email
                  </p>
                  {record.email ? (
                    <a
                      href={`mailto:${record.email}`}
                      className="mt-0.5 block break-all font-sans text-sm text-navy underline-offset-2 hover:underline"
                    >
                      {record.email}
                    </a>
                  ) : (
                    <p className="mt-0.5 font-sans text-sm text-subtle">-</p>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Serve Relationship">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field
                  label="Relationship Status"
                  value={record.relationshipStatus}
                />
                <Field label="Source" value={record.source} />
                <Field
                  label="Support Type"
                  value={
                    record.supportType
                      ? (SUPPORT_LABELS[record.supportType] ?? record.supportType)
                      : "-"
                  }
                />
                <Field
                  label="Start Timing"
                  value={
                    record.startTiming
                      ? (TIMING_LABELS[record.startTiming] ?? record.startTiming)
                      : "-"
                  }
                />
                <Field
                  label="Referral Source"
                  value={formatReferral(record.referralSource)}
                />
                <Field
                  label="Source Channel"
                  value={prospect.source?.replace(/_/g, " ") ?? "-"}
                  capitalize
                />
              </div>

              {prospect.care_needs && (
                <div>
                  <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Care Needs
                  </p>
                  <p className="rounded-lg border border-ivory-border bg-ivory px-4 py-3 font-sans text-sm leading-relaxed text-body">
                    {prospect.care_needs}
                  </p>
                </div>
              )}
            </div>
          </Section>

          <PlaceholderSection
            title="Communication Preferences"
            description="Preferred contact method, language, and outreach schedule will appear here."
          />
        </div>

        <div className="space-y-6">
          <Section title="Next Recommended Action">
            <div className="mb-4">
              <StatusBadge status={prospect.status} />
            </div>
            <WorkflowActions
              id={prospect.id}
              currentStatus={prospect.status}
              variant="buttons"
            />
          </Section>

          <PlaceholderSection
            title="Assessment History"
            description="Completed and scheduled assessments will appear here."
          />
          <PlaceholderSection
            title="Wellness Notes"
            description="Staff notes and wellness observations will appear here."
          />
          <PlaceholderSection
            title="Ask Serve Summary"
            description="Ask Serve will surface relationship insights and suggested next steps here."
          />
          <PlaceholderSection
            title="Timeline"
            description="All interactions, status changes, and activity will appear here in chronological order."
          />
        </div>
      </div>
    </PageContainer>
  );
}
