import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Prospect } from "@/lib/supabase/types";
import { DEMO_PROSPECTS } from "@/lib/demo/communityData";
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
  if (!value) return "—";
  return value.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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

function Field({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className={`mt-0.5 font-sans text-sm text-body ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}

function PlaceholderSection({ title, description }: { title: string; description: string }) {
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
  const supabase = createServerClient();

  const { data } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();

  const prospect: Prospect | null =
    (data as Prospect | null) ?? DEMO_PROSPECTS.find((p) => p.id === id) ?? null;

  if (!prospect) notFound();

  const residentName =
    [prospect.resident_first_name, prospect.resident_last_name]
      .filter(Boolean)
      .join(" ") || "Unknown Resident";

  const contactName =
    [prospect.contact_first_name, prospect.contact_last_name]
      .filter(Boolean)
      .join(" ") || "—";

  return (
    <PageContainer title={residentName}>
      {/* Back nav */}
      <div className="mb-6">
        <Link
          href="/residents"
          className="font-sans text-xs text-muted transition-colors hover:text-body"
        >
          ← Back to Residents
        </Link>
      </div>

      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-4xl font-light text-navy">{residentName}</h1>
          <div className="mt-3 flex items-center gap-3">
            <StatusBadge status={prospect.status} />
            <span className="font-sans text-xs text-muted">
              Received {fullDate(prospect.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Left — 2 cols */}
        <div className="space-y-6 lg:col-span-2">

          {/* Resident Profile */}
          <Section title="Resident Profile">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Full Name" value={residentName} />
              <Field
                label="Relationship to Contact"
                value={prospect.resident_relationship?.replace(/_/g, " ") ?? "—"}
                capitalize
              />
              <Field label="ZIP Code" value={prospect.zip_code ?? "—"} />
              <Field
                label="Inquiry Type"
                value={prospect.inquiry_type?.replace(/_/g, " ") ?? "—"}
                capitalize
              />
            </div>
          </Section>

          {/* Family Contacts */}
          <Section title="Family Contacts">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Contact Name" value={contactName} />
                <Field label="Relationship" value={prospect.resident_relationship?.replace(/_/g, " ") ?? "—"} capitalize />
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">Phone</p>
                  {prospect.contact_phone ? (
                    <a
                      href={`tel:${prospect.contact_phone}`}
                      className="mt-0.5 block font-sans text-sm text-navy underline-offset-2 hover:underline"
                    >
                      {prospect.contact_phone}
                    </a>
                  ) : (
                    <p className="mt-0.5 font-sans text-sm text-subtle">—</p>
                  )}
                </div>
                <div>
                  <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">Email</p>
                  {prospect.contact_email ? (
                    <a
                      href={`mailto:${prospect.contact_email}`}
                      className="mt-0.5 block break-all font-sans text-sm text-navy underline-offset-2 hover:underline"
                    >
                      {prospect.contact_email}
                    </a>
                  ) : (
                    <p className="mt-0.5 font-sans text-sm text-subtle">—</p>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* Serve Relationship */}
          <Section title="Serve Relationship">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field
                  label="Support Type"
                  value={
                    prospect.support_type
                      ? (SUPPORT_LABELS[prospect.support_type] ?? prospect.support_type)
                      : "—"
                  }
                />
                <Field
                  label="Start Timing"
                  value={
                    prospect.start_timing
                      ? (TIMING_LABELS[prospect.start_timing] ?? prospect.start_timing)
                      : "—"
                  }
                />
                <Field label="Referral Source" value={formatReferral(prospect.referral_source)} />
                <Field label="Source Channel" value={prospect.source?.replace(/_/g, " ") ?? "—"} capitalize />
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

          {/* Communication Preferences */}
          <PlaceholderSection
            title="Communication Preferences"
            description="Preferred contact method, language, and outreach schedule will appear here."
          />

        </div>

        {/* Right — 1 col */}
        <div className="space-y-6">

          {/* Next Recommended Action */}
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

          {/* Assessment History */}
          <PlaceholderSection
            title="Assessment History"
            description="Completed and scheduled assessments will appear here."
          />

          {/* Wellness Notes */}
          <PlaceholderSection
            title="Wellness Notes"
            description="Staff notes and wellness observations will appear here."
          />

          {/* Ask Serve Summary */}
          <PlaceholderSection
            title="Ask Serve Summary"
            description="Ask Serve will surface relationship insights and suggested next steps here."
          />

          {/* Timeline */}
          <PlaceholderSection
            title="Timeline"
            description="All interactions, status changes, and activity will appear here in chronological order."
          />

        </div>
      </div>
    </PageContainer>
  );
}
