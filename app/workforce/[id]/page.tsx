import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getWorkforceMemberProfile, getWorkforceRoster } from "@/lib/workforce/roster";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  canAccessWorkforceDocuments,
  canCorrectWorkforceIdentityLinks,
  canEditWorkforceCanonicalProfile,
  canEditWorkforceLegalIdentity,
  canManageWorkforceCommunityMemberships,
} from "@/lib/workforce/permissions";
import { resolveWorkforceEmail, resolveWorkforcePhone } from "@/lib/workforce/resolvers";
import { listCommunities } from "@/lib/data/communities";
import { WorkforceActivityTimeline } from "@/components/workforce/WorkforceActivityTimeline";
import { SourceIdentitiesSection } from "@/components/workforce/SourceIdentitiesSection";
import { CanonicalProfileCard } from "@/components/workforce/CanonicalProfileCard";
import { CommunityMembershipsSection } from "@/components/workforce/CommunityMembershipsSection";
import { ProfileChangeHistory } from "@/components/workforce/ProfileChangeHistory";
import { EmployeeRecordAuditSection } from "@/components/workforce/EmployeeRecordAuditSection";
import { WorkforceComplianceActionsList } from "@/components/workforce/WorkforceComplianceActionsList";
import { EmployeeSummaryPanel } from "@/components/workforce/EmployeeSummaryPanel";
import { ATTENTION_STATE_LABELS, ATTENTION_STATE_STYLES } from "@/components/workforce/WorkforceRosterTable";
import type { WorkforceLifecycleStatus } from "@/lib/workforce/lifecycleStatus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIFECYCLE_LABELS: Record<WorkforceLifecycleStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
  pending_start: "Pending Start",
};

const LIFECYCLE_STYLES: Record<WorkforceLifecycleStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-ivory-warm text-muted",
  terminated: "bg-red-50 text-red-700",
  pending_start: "bg-blue-50 text-blue-700",
};

function formatTerminationDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-4 font-sans text-label font-semibold uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">{label}</p>
      <p className="mt-0.5 font-sans text-base text-body">{value}</p>
    </div>
  );
}

export default async function WorkforceMemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ requirement?: string }>;
}) {
  const [{ id }, { requirement: highlightRequirementCode }] = await Promise.all([params, searchParams]);

  const [profile, currentUser, roster, communities] = await Promise.all([
    getWorkforceMemberProfile(id),
    getCurrentAuthorizedUser(),
    getWorkforceRoster(),
    listCommunities(),
  ]);

  if (!profile) notFound();

  const {
    member,
    displayName,
    axiscareLink,
    sourceIdentities,
    documents,
    activity,
    registry,
    evidence,
    lifecycle,
    communityMemberships,
    profileChangeHistory,
    openDiscrepancies,
    employeeRecordAudit,
    attentionState,
    openComplianceActions,
    nextAction,
  } = profile;
  const canManage = canAccessWorkforceDocuments(currentUser?.role ?? null);
  const canCorrectIdentities = canCorrectWorkforceIdentityLinks(currentUser?.role ?? null);
  const canEditProfile = canEditWorkforceCanonicalProfile(currentUser?.role ?? null);
  const canEditLegalIdentity = canEditWorkforceLegalIdentity(currentUser?.role ?? null);
  const canManageCommunities = canManageWorkforceCommunityMemberships(currentUser?.role ?? null);
  const rosterOptions = roster.map((r) => ({ workforceMemberId: r.workforceMemberId, displayName: r.displayName }));
  const canonicalEmail = resolveWorkforceEmail(member, axiscareLink);
  const canonicalPhone = resolveWorkforcePhone(member, axiscareLink);
  const sourceData = axiscareLink?.approved_source_data as
    | {
        statusActive?: boolean | null;
        statusLabel?: string | null;
        classes?: Array<{ code: string | null; label: string | null }>;
        hireDate?: string | null;
        startDate?: string | null;
        terminationDate?: string | null;
        regionName?: string | null;
        personalEmail?: string | null;
        mobilePhone?: string | null;
        homePhone?: string | null;
      }
    | undefined;

  return (
    <PageContainer title={displayName}>
      <div className="mb-6">
        <Link href="/workforce" className="font-sans text-sm text-muted hover:text-body hover:underline">
          ← Back to Workforce
        </Link>
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-light text-body">{displayName}</h1>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${LIFECYCLE_STYLES[lifecycle.status]}`}
        >
          {LIFECYCLE_LABELS[lifecycle.status]}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${ATTENTION_STATE_STYLES[attentionState.state]}`}
        >
          {ATTENTION_STATE_LABELS[attentionState.state]}
        </span>
      </div>
      <p className="mb-6 font-sans text-sm text-muted">
        {lifecycle.status === "terminated" && lifecycle.terminationDate
          ? `Terminated ${formatTerminationDate(lifecycle.terminationDate)} · source: AxisCare`
          : nextAction
            ? `Next: ${nextAction.title}`
            : "No action required."}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <EmployeeSummaryPanel
            attentionState={attentionState}
            nextAction={nextAction}
            openActionsCount={openComplianceActions.length}
            registry={employeeRecordAudit.registry}
            workforceMemberId={id}
          />

          <CanonicalProfileCard
            workforceMemberId={id}
            member={member}
            primaryVendorIdentity={axiscareLink}
            openDiscrepancies={openDiscrepancies}
            canEdit={canEditProfile}
            canEditLegalIdentity={canEditLegalIdentity}
          />

          <Section title="Overview">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" value={canonicalEmail ?? "—"} />
              <Field label="Phone" value={canonicalPhone ?? "—"} />
              <Field label="Employment status" value={sourceData?.statusLabel ?? "—"} />
              <Field label="AxisCare connection" value={axiscareLink ? "Linked" : "Not linked"} />
              <Field
                label="Last synchronized"
                value={axiscareLink?.last_synced_at ? new Date(axiscareLink.last_synced_at).toLocaleString() : "Never"}
              />
              <Field label="Registry evidence status" value={registry.explanation} />
            </div>
          </Section>

          <Section title="Community Memberships">
            <CommunityMembershipsSection
              workforceMemberId={id}
              memberships={communityMemberships}
              communities={communities}
              canManage={canManageCommunities}
            />
          </Section>

          <Section title="AxisCare Operations">
            {axiscareLink ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Status" value={sourceData?.statusLabel ?? "—"} />
                <Field label="Region" value={sourceData?.regionName ?? "—"} />
                <Field
                  label="Classes"
                  value={
                    sourceData?.classes && sourceData.classes.length > 0
                      ? sourceData.classes.map((c) => c.label ?? c.code).filter(Boolean).join(", ")
                      : "—"
                  }
                />
                <Field label="Hire date" value={sourceData?.hireDate ?? "—"} />
                <Field label="Start date" value={sourceData?.startDate ?? "—"} />
                <Field label="Termination date" value={sourceData?.terminationDate ?? "—"} />
              </div>
            ) : (
              <p className="font-sans text-sm text-muted">Not yet linked to an AxisCare caregiver record.</p>
            )}
            <p className="mt-4 font-sans text-xs text-subtle">
              All fields above are sourced from AxisCare and read-only — Serve does not edit AxisCare-owned facts.
            </p>
          </Section>

          <Section title="Source Identities">
            <SourceIdentitiesSection identities={sourceIdentities} canCorrect={canCorrectIdentities} />
            <p className="mt-4 font-sans text-xs text-subtle">
              A caregiver may have more than one AxisCare record (e.g. a prior duplicate). The primary record drives
              the fields above; duplicate and retired records are kept here for history and are never deleted.
            </p>
          </Section>

          <div id="employee-record-audit">
            <Section title="Employee Record Audit">
              <EmployeeRecordAuditSection
                registry={employeeRecordAudit.registry}
                workforceMemberId={id}
                canManage={canManage}
                rosterOptions={rosterOptions}
                lifecycleStatus={lifecycle.status}
                history={evidence}
                highlightRequirementCode={highlightRequirementCode}
              />
            </Section>
          </div>

          {canManage && (
            <Section title="Documents">
              {documents.length > 0 ? (
                <ul className="divide-y divide-ivory-border">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-sans text-sm text-body">{doc.original_filename}</p>
                        <p className="font-sans text-xs text-muted">
                          {doc.document_type} · {doc.status} · uploaded {new Date(doc.uploaded_at).toLocaleDateString()} by{" "}
                          {doc.uploaded_by}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-sm text-muted">No documents uploaded yet.</p>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title={`Open Actions (${openComplianceActions.length})`}>
            <WorkforceComplianceActionsList
              actions={openComplianceActions}
              workforceMemberId={id}
              canManage={canManage}
            />
          </Section>
          <WorkforceActivityTimeline events={activity} />
          <ProfileChangeHistory changes={profileChangeHistory} />
        </div>
      </div>
    </PageContainer>
  );
}
