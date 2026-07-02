import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityResidentById } from "@/lib/data/communityMetrics";
import { PageContainer } from "@/components/PageContainer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fullDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateOnly(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
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
  if (digits.length !== 10) return phone ?? "-";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function compactDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-sans text-sm text-body">{value}</p>
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

  const resident = record.resident;
  const contactName =
    record.familyContact === "No contact on file" ? "-" : record.familyContact;
  const location = [
    record.unitNumber ? `Unit ${record.unitNumber}` : null,
    record.building,
  ]
    .filter(Boolean)
    .join(" | ");

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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-gold-subtle px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-gold-dark">
              {record.serveRelationshipLabel}
            </span>
            {resident.status && (
              <span className="rounded-full bg-ivory-warm px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-muted">
                Resident {titleCase(resident.status)}
              </span>
            )}
            {record.needsReview && (
              <span className="rounded-full bg-ivory-warm px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-muted">
                Review: {titleCase(record.needsReview)}
              </span>
            )}
            <span className="font-sans text-xs text-muted">
              Updated {fullDate(record.updatedAt ?? record.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Resident Profile">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Full Name" value={record.residentName} />
              <Field label="Preferred Name" value={resident.preferred_name ?? "-"} />
              <Field label="Location" value={location || "-"} />
              <Field label="Resident Type" value={titleCase(record.residentType)} />
              <Field
                label="Serve Relationship Status"
                value={record.serveRelationshipLabel}
              />
              <Field
                label="Service Model"
                value={titleCase(record.importedServiceModel)}
              />
              <Field label="Resident Status" value={titleCase(resident.status)} />
              <Field label="Date of Birth" value={dateOnly(resident.date_of_birth)} />
              <Field label="Date of Admission" value={dateOnly(resident.date_of_admission)} />
              <Field label="Mobility" value={resident.mobility ?? "-"} />
              <Field label="Preferred Language" value={resident.preferred_language ?? "-"} />
              <Field label="Needs Review" value={titleCase(record.needsReview)} />
            </div>
          </Section>

          {record.importReviewNotes.length > 0 && (
            <Section title="Review Notes">
              <div className="space-y-2">
                {record.importReviewNotes.map((note) => (
                  <p
                    key={note}
                    className="rounded-lg border border-ivory-border bg-ivory px-4 py-3 font-sans text-sm leading-relaxed text-body"
                  >
                    {note}
                  </p>
                ))}
              </div>
            </Section>
          )}

          {record.sourceNameDiffers && (
            <Section title="Source Identity Review">
              <div className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
                <p className="font-sans text-sm font-semibold text-navy">
                  Source name differs from resident roster
                </p>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3">
                  <Field label="Resident Roster Name" value={record.residentName} />
                  <Field
                    label="Source Name"
                    value={record.sourceDisplayName ?? "-"}
                  />
                </div>
              </div>
            </Section>
          )}

          <Section title="Family Contacts">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Contact Name" value={contactName} />
                <Field
                  label="Relationship"
                  value={titleCase(resident.family_contact_relationship)}
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
                      {formatPhone(record.phone)}
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

          <Section title="Imported Contacts">
            {record.importedContacts.length > 0 ? (
              <div className="space-y-4">
                {record.importedContacts.map((contact, index) => {
                  const importedName =
                    contact.contact_name ||
                    [contact.first_name, contact.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    "Unnamed Contact";

                  return (
                    <div
                      key={contact.id ?? `${importedName}-${index}`}
                      className="rounded-lg border border-ivory-border bg-ivory px-4 py-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <p className="font-sans text-sm font-semibold text-navy">
                          {importedName}
                        </p>
                        {contact.is_primary && (
                          <span className="rounded-full bg-gold-subtle px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-gold-dark">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <Field
                          label="Relationship"
                          value={titleCase(contact.relationship ?? null)}
                        />
                        <Field
                          label="Source"
                          value={contact.source_system ?? "Imported"}
                        />
                        <Field
                          label="Phone"
                          value={formatPhone(contact.phone ?? null)}
                        />
                        <Field label="Email" value={contact.email ?? "-"} />
                        <Field
                          label="Imported"
                          value={compactDate(
                            contact.imported_at ||
                              contact.updated_at ||
                              contact.created_at
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="font-sans text-sm text-muted">
                No imported contact records are attached to this resident yet.
              </p>
            )}
          </Section>

          <Section title="Resident Source">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Community" value={resident.community_name ?? "-"} />
                <Field label="Community Code" value={resident.community_code ?? "-"} />
                <Field label="Source System" value={resident.source_system ?? "-"} />
                <Field label="Source Status" value={titleCase(resident.source_status)} />
                <Field
                  label="Staged Serve Status"
                  value={
                    record.sourceRelationshipStatus
                      ? titleCase(record.sourceRelationshipStatus)
                      : "-"
                  }
                />
                <Field
                  label="Imported Cinch Status"
                  value={titleCase(record.sourceCinchStatus)}
                />
                <Field
                  label="Imported Service Model"
                  value={titleCase(record.sourceServiceType)}
                />
                <Field
                  label="Source Display Name"
                  value={record.sourceDisplayName ?? "-"}
                />
                <Field
                  label="Source Full Name"
                  value={record.sourceFullName ?? "-"}
                />
                <Field
                  label="Imported Relationship"
                  value={titleCase(resident.relationship_status)}
                />
                <Field label="Import Batch" value={resident.import_batch ?? "-"} />
                <Field label="Source File" value={resident.source_file ?? "-"} />
              </div>

              {resident.care_needs && (
                <div>
                  <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Care Needs
                  </p>
                  <p className="rounded-lg border border-ivory-border bg-ivory px-4 py-3 font-sans text-sm leading-relaxed text-body">
                    {resident.care_needs}
                  </p>
                </div>
              )}

              {resident.notes && (
                <div>
                  <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Notes
                  </p>
                  <p className="rounded-lg border border-ivory-border bg-ivory px-4 py-3 font-sans text-sm leading-relaxed text-body">
                    {resident.notes}
                  </p>
                </div>
              )}
            </div>
          </Section>

          <Section title="Imported Relationship History">
            {record.importedRelationships.length > 0 ? (
              <div className="space-y-3">
                {record.importedRelationships.map((relationship, index) => {
                  const importedStatus =
                    relationship.serve_relationship_status ||
                    relationship.cinch_status ||
                    relationship.source_status ||
                    relationship.relationship_status ||
                    relationship.status ||
                    null;

                  return (
                    <div
                      key={relationship.id ?? `${importedStatus}-${index}`}
                      className="rounded-lg border border-ivory-border bg-ivory px-4 py-3"
                    >
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <Field
                          label="Imported Status"
                          value={titleCase(importedStatus)}
                        />
                        <Field
                          label="Source"
                          value={relationship.source_system ?? "Imported"}
                        />
                        <Field
                          label="Service Model"
                          value={titleCase(
                            relationship.service_model ||
                              relationship.service_type ||
                              relationship.care_model ||
                              null
                          )}
                        />
                        <Field
                          label="Effective"
                          value={compactDate(
                            relationship.effective_date ||
                              relationship.start_date ||
                              relationship.imported_at ||
                              relationship.updated_at ||
                              relationship.created_at
                          )}
                        />
                        <Field
                          label="Ended"
                          value={compactDate(relationship.end_date)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="font-sans text-sm text-muted">
                No imported relationship records are attached to this resident yet.
              </p>
            )}
          </Section>

          <PlaceholderSection
            title="Communication Preferences"
            description="Preferred contact method, language, and outreach schedule will appear here."
          />
        </div>

        <div className="space-y-6">
          <Section title="Next Recommended Action">
            <div className="mb-4">
              <span className="rounded-full bg-gold-subtle px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-gold-dark">
                {record.serveRelationshipLabel}
              </span>
            </div>
            <p className="font-sans text-sm leading-relaxed text-body">
              {record.serveRelationshipStatus === "wellness_watch"
                ? "Resident is currently flagged for wellness watch."
                : record.needsReview
                  ? `Review ${titleCase(record.needsReview).toLowerCase()} details before outreach.`
                  : "No resident action is currently flagged from the imported record."}
            </p>
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
