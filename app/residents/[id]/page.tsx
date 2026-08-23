import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityResidentById } from "@/lib/data/communityMetrics";
import { getResidentConnections } from "@/lib/data/connections";
import { PageContainer } from "@/components/PageContainer";
import { GettingToKnow } from "@/components/residents/GettingToKnow";
import { summarizeGettingToKnow } from "@/lib/gettingToKnow/summarize";
import { ResidentProfileCard } from "@/components/residents/ResidentProfileCard";
import { WellnessNotes } from "@/components/residents/WellnessNotes";
import { getWellnessNotes } from "@/lib/data/wellnessNotes";
import { getOpenResidentWellnessFollowUps } from "@/lib/data/wellnessFollowUps";
import { getResidentCurrentNeeds } from "@/lib/data/residentCurrentNeeds";
import { getResidentWorkingNotes } from "@/lib/data/residentWorkingNotes";
import { getRelationshipsByResident, getRelationshipActions } from "@/lib/data/relationships";
import { findActiveResidentProspect } from "@/lib/relationships/duplicateDetection";
import { ResidentRelationshipSummary } from "@/components/residents/ResidentRelationshipSummary";
import { ResidentEssentials } from "@/components/residents/ResidentEssentials";
import { CollapsibleSection } from "@/components/residents/CollapsibleSection";
import { getResidentTimeline } from "@/lib/data/residentTimeline";
import { CurrentPicture } from "@/components/residents/CurrentPicture";
import { WorkWithThisPersonStrip } from "@/components/residents/WorkWithThisPersonStrip";
import { ResidentTimeline } from "@/components/residents/ResidentTimeline";
import { AssessmentSection } from "@/components/residents/AssessmentSection";
import { getAssessmentSessionsForResident } from "@/lib/data/assessmentIntelligence";
import { Badge } from "@/components/ui/Badge";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canAccessResidentEvidence, canEditResidentProfile, canPerformReconciliationActions } from "@/lib/auth/permissions";
import { ResidentEvidenceSection } from "@/components/residents/ResidentEvidenceSection";
import { ServeRelationshipCorrectionControl } from "@/components/residents/ServeRelationshipCorrectionControl";
import { ClientReadinessBoard, type ClientReadinessBoardItem } from "@/components/clientReadiness/ClientReadinessBoard";
import { ClientReadinessSection } from "@/components/clientReadiness/ClientReadinessSection";
import { getClientReadinessEvaluation, isOutsideClientReadinessPopulation } from "@/lib/clientReadiness/clientReadinessReadiness";
import { getAxisCareLifecycleSignal } from "@/lib/integrations/axiscare/lifecycleSignals";
import { STANDBY_INACTIVE_CORRECTION_MARKER } from "@/lib/integrations/axiscare/clientLifecycle";
import { buildTriageClassificationDetail } from "@/lib/clientReadiness/triageClassificationDetail";
import {
  getCurrentResidentTriageClassification,
  getResidentTriageClassificationHistory,
} from "@/lib/data/residentTriageClassifications";
import { getAxisCareClientCanonicalSnapshot } from "@/lib/data/axiscareClientCanonicalSnapshot";
import { getResidentServeRelationshipDetail } from "@/lib/data/residentServeRelationships";
import { getOpenDuplicateCandidateForResident } from "@/lib/data/residentIdentity";
import {
  ResidentIdentityAndRelationship,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_TONES,
} from "@/components/residents/ResidentIdentityAndRelationship";
import { getPersonDocumentsForSubject } from "@/lib/data/personDocuments";
import { getPersonEvidenceForSubject } from "@/lib/data/personEvidence";
import { SUBJECT_TYPE_RESIDENT } from "@/lib/supabase/types";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { PEOPLE_WE_SERVE_CONTEXT } from "@/lib/askServe/areaContexts";
import { hasTodaysWorkOrigin } from "@/lib/workspace/originMarker";
import { BackToTodaysWorkLink } from "@/components/workspace/BackToTodaysWorkLink";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function evidenceSummary(evidence: { created_at: string; verification_status: string; expiration_date: string | null } | null) {
  if (!evidence) return null;
  const parts = [`Recorded ${new Date(evidence.created_at).toLocaleDateString()}`];
  parts.push(evidence.verification_status === "verified" ? "verified" : evidence.verification_status.replace(/_/g, " "));
  if (evidence.expiration_date) parts.push(`expires ${new Date(evidence.expiration_date).toLocaleDateString()}`);
  return parts.join(" — ");
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">{label}</p>
      <p className="mt-0.5 font-sans text-base text-body">{value}</p>
    </div>
  );
}

export default async function ResidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; requirement?: string; editSection?: string }>;
}) {
  const { id } = await params;
  const { from, requirement: selectedRequirementCode, editSection } = await searchParams;
  // Deep-link support (Closed-Loop UX Pass, Phase 1) — lets an external
  // surface (Reconciliation's AxisCare conflict "Edit" action) land the
  // operator directly in the Care & Contacts card's edit form instead of
  // the top of this page. Only "family_contact" is produced today; any
  // other/unrecognized value is ignored, never guessed at.
  const initialEditingTarget = editSection === "family_contact" ? "contact" : null;

  // Scope resolves before the resident fetch — a direct URL to a resident
  // outside the caller's authorized community must not bypass it (Phase
  // E/F, section 6). getCommunityResidentById scopes the query itself
  // (WHERE community_id = ...), so a resident outside scope simply comes
  // back null, exactly like a genuinely unknown id.
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const record = await getCommunityResidentById(id, communityFilter);

  if (!record) notFound();

  const canEditProfile = canEditResidentProfile(profile?.role);
  const canManageEvidence = canAccessResidentEvidence(profile?.role);
  const canResolveIdentity = canPerformReconciliationActions(profile?.role);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  const connections = await getResidentConnections(id);
  const wellnessNotes = await getWellnessNotes(id);
  const openFollowUps = await getOpenResidentWellnessFollowUps(id);
  const currentNeeds = await getResidentCurrentNeeds(id);
  const workingNotes = await getResidentWorkingNotes(id);
  const timelineEvents = await getResidentTimeline(id);
  const relationships = await getRelationshipsByResident(id);
  const assessmentSessions = await getAssessmentSessionsForResident(id);
  const residentDocuments = canManageEvidence ? await getPersonDocumentsForSubject(SUBJECT_TYPE_RESIDENT, id) : [];
  const residentEvidence = canManageEvidence ? await getPersonEvidenceForSubject(SUBJECT_TYPE_RESIDENT, id) : [];
  const canSeeRelationshipDetail = canManageEvidence || canEditProfile;
  const residentRelationshipDetail = canSeeRelationshipDetail
    ? await getResidentServeRelationshipDetail(id, communityFilter)
    : null;
  // Structured triage classification — resolved independent of whether
  // Serve has recorded anything yet, so a recognized (or legacy/
  // unrecognized) AxisCare value can still render on its own. Only trust
  // the AxisCare match once identity is confirmed, matching the same gate
  // already used for the header's "AxisCare #..." display below. Resolved
  // BEFORE getClientReadinessEvaluation so it can be passed straight in —
  // this page is the one caller that supplies it, getting the atomicity
  // guarantee documented on evaluateTriageClassification().
  const triageHistory = canManageEvidence ? await getResidentTriageClassificationHistory(id) : [];
  const currentTriageClassification = canManageEvidence ? await getCurrentResidentTriageClassification(id) : null;
  const axiscareTriageSnapshot =
    canManageEvidence && residentRelationshipDetail?.axiscareMatch?.identityStatus === "confirmed"
      ? await getAxisCareClientCanonicalSnapshot(residentRelationshipDetail.axiscareMatch.axiscareId)
      : null;
  const triageDetail = buildTriageClassificationDetail({
    serveCurrent: currentTriageClassification,
    axiscareRawDescription: axiscareTriageSnapshot?.triage_level_description ?? null,
  });

  // Distinguishes an established standby client from every other path to
  // inactive_client, so Discharge/Transfer never fires a false deficiency
  // for a client who simply hasn't been scheduled yet. Two ways to
  // establish standby status — see clientLifecycle.ts's own header for
  // both: (1) a reviewed AxisCare class-code signal (e.g. "WAFrisco -
  // Active No Visits"), or (2) a governed correction carrying the
  // explicit STANDBY_INACTIVE_CORRECTION_MARKER, for a resident whose
  // class signal alone isn't explicit enough. See evaluateDischarge()'s
  // own comment for the full rationale.
  const isStandbyInactiveClient =
    residentRelationshipDetail?.projection.relationship === "inactive_client" &&
    (getAxisCareLifecycleSignal(residentRelationshipDetail.axiscareMatch?.classes ?? []) === "inactive_client" ||
      !!residentRelationshipDetail.projection.correction?.rationale.includes(STANDBY_INACTIVE_CORRECTION_MARKER));

  const clientReadiness = canManageEvidence
    ? await getClientReadinessEvaluation(
        id,
        residentRelationshipDetail?.projection.relationship ?? "no_current_relationship",
        currentTriageClassification,
        isStandbyInactiveClient
      )
    : null;

  const resident = record.resident;
  const contactName = record.familyContact === "No contact on file" ? "" : record.familyContact;
  const location = [record.unitNumber ? `Unit ${record.unitNumber}` : null, record.building].filter(Boolean).join(" | ");
  const residentPageHref = `/residents/${id}`;

  const clientReadinessBoardItems: ClientReadinessBoardItem[] = (clientReadiness?.requirements ?? []).map((r) => ({
    requirementCode: r.requirement.requirement_code,
    requirementName: r.requirement.name,
    regulatoryAuthority: r.requirement.regulatory_authority,
    status: r.status,
    explanation: r.explanation,
    evidenceSummary: evidenceSummary(r.latestEvidence),
    evidenceDocumentId: r.latestEvidence?.document_id ?? null,
  }));
  const clientReadinessApplicable = clientReadinessBoardItems.filter((r) => r.status !== "not_applicable");
  const clientReadinessSatisfiedCount = clientReadinessApplicable.filter(
    (r) => r.status === "compliant" || r.status === "satisfied_by_event" || r.status === "exception"
  ).length;
  // The same predicate getClientReadinessEvaluation() itself gates
  // standard requirements on (isOutsideClientReadinessPopulation) — never
  // a second, independently-maintained check. Deliberately NOT "anything
  // but active_client": inactive_client (an established client — either a
  // real former/discharged client or, as of the Frisco Needs Review
  // investigation, an equally legitimate standby client without scheduled
  // visits — see clientLifecycle.ts's header) stays inside the population
  // here too, matching Discharge/Transfer's own applicability rule —
  // never collapsed into the same "not applicable" messaging a prospect
  // who's never been served gets. Known limitation for the standby case:
  // see the population-gate comment in clientReadinessReadiness.ts.
  const clientReadinessOutsidePopulation = isOutsideClientReadinessPopulation(
    residentRelationshipDetail?.projection.relationship ?? "no_current_relationship"
  );
  const guardianConfirmedNone = Boolean(
    clientReadiness?.requirements.find((r) => r.requirement.requirement_code === "CR_CLIENT_PROFILE_ON_FILE")?.latestEvidence
      ?.satisfaction_context === "guardian_confirmed_none"
  );

  // Section B (Relationship / CRM summary) — every field here already
  // existed (Relationship.owner_label, last_meaningful_touch_at,
  // RelationshipAction, resident-level working notes); this page just
  // surfaces what getRelationshipsByResident() already fetched.
  const primaryRelationship = relationships[0] ?? null;
  const relationshipActions = primaryRelationship ? await getRelationshipActions(primaryRelationship.id) : [];
  const openRelationshipAction =
    relationshipActions
      .filter((a) => a.status === "open")
      .sort((a, b) => {
        if (!a.due_at && !b.due_at) return 0;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      })[0] ?? null;
  const recentWorkingNote = workingNotes[0] ?? null;

  // Reused, not re-derived: findActiveResidentProspect() is the same
  // duplicate-prevention rule the old "Start Relationship" flow already
  // used, so "Add to Prospect Pipeline" never offers to create a second
  // open prospect record.
  const activeProspectRelationship = findActiveResidentProspect(
    relationships.map((r) => ({
      id: r.id,
      relationshipType: r.relationship_type,
      residentId: r.resident_id,
      status: r.status,
      updatedAt: r.updated_at,
    })),
    id
  );

  // Reused, not re-derived: the same approved/operationalized status
  // vocabulary AssessmentSection.tsx's own StatusBadge already treats as
  // "successfully completed" — no new assessment-state logic.
  const hasCompletedAssessment = assessmentSessions.some((s) => s.status === "approved" || s.status === "operationalized");

  const ispStatus = clientReadinessBoardItems.find((r) => r.requirementCode === "CR_ISP_ON_FILE_AND_CURRENT")?.status;
  const assessmentReadinessStatus = clientReadinessBoardItems.find((r) => r.requirementCode === "CR_ASSESSMENT_CURRENT")?.status;

  // Only checked when there's an actual conflict to explain — a known
  // duplicate-resident candidate changes which action the alert below
  // offers (a real "Resolve duplicate" route into the existing
  // comparison/merge review flow, instead of a relationship-correction
  // control that would not fix a duplicate-resident root cause).
  const openDuplicateCandidate = residentRelationshipDetail?.projection.hasConflict
    ? await getOpenDuplicateCandidateForResident(id)
    : null;

  return (
    <PageContainer title={record.residentName}>
      {/* The one shared width constraint for the whole resident-profile
          composition — PageContainer's own <main> has no max-width of its
          own (just page padding), so this single div was the entire
          "narrow centered column" root cause. Widened from max-w-3xl
          (768px) to max-w-6xl (1152px): enough for Current Picture's
          Current Needs/Working Notes to sit side-by-side on desktop
          without individual cards needing their own hardcoded widths, and
          still a deliberate, bounded reading width — not viewport-stretch —
          on very wide monitors. */}
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/residents" className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light">
            ← Back to Residents
          </Link>
          {hasTodaysWorkOrigin(from) && <BackToTodaysWorkLink />}
        </div>

        {/* A — Header. Quiet by default: name, location, one canonical
            relationship, AxisCare ID only once confirmed. No competing
            vendor/historical status, no permanent "Corrected" badge. */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <h1 className="font-serif text-page-title font-light text-body">{record.residentDisplayName}</h1>
            <p className="mt-1 font-sans text-sm text-muted">{location || "Watermere Resident"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-sans text-sm text-body">
              {residentRelationshipDetail && (
                <Badge tone={RELATIONSHIP_TONES[residentRelationshipDetail.projection.relationship]}>
                  {RELATIONSHIP_LABELS[residentRelationshipDetail.projection.relationship]}
                </Badge>
              )}
              {residentRelationshipDetail?.axiscareMatch?.identityStatus === "confirmed" && (
                <span className="text-muted">AxisCare #{residentRelationshipDetail.axiscareMatch.axiscareId}</span>
              )}
              {primaryRelationship?.owner_label && <span className="text-muted">· Owner: {primaryRelationship.owner_label}</span>}
              {record.needsReview && <Badge tone="warning">Review: {titleCase(record.needsReview)}</Badge>}
            </div>
          </div>

          <div className="flex gap-3 sm:shrink-0">
            {askServeEnabled && (
              <AskServeTrigger
                context={buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, {
                  surface: "resident_detail",
                  route: residentPageHref,
                  pageTitle: record.residentDisplayName,
                  subjectType: "resident",
                  subjectId: id,
                  subjectLabel: record.residentDisplayName,
                  userRole: profile?.role ?? undefined,
                })}
                label="Ask Serve about this person"
              />
            )}
          </div>
        </div>

        {/* Work With This Person — the obvious "where do I click to
            capture something" strip, near the top per the resident-profile
            UX simplification. */}
        <div className="mb-6">
          <WorkWithThisPersonStrip
            residentId={id}
            residentDisplayName={record.residentDisplayName}
            relationshipId={primaryRelationship?.id ?? null}
            hasCompletedAssessment={hasCompletedAssessment}
            canAddToProspectPipeline={activeProspectRelationship === null}
            communityName={resident.community_name}
            contactName={contactName}
            contactRelationship={resident.family_contact_relationship ?? ""}
            contactPhone={record.phone ?? ""}
            contactEmail={record.email ?? ""}
          />
        </div>

        {/* One concise alert, only when something genuinely needs a
            decision — identity confirmation or an unresolved relationship
            conflict. Renders nothing at all otherwise. */}
        {residentRelationshipDetail && (
          <div className="mb-6">
            <ResidentIdentityAndRelationship
              residentId={id}
              residentDisplayName={record.residentName}
              currentRelationship={residentRelationshipDetail.projection.relationship}
              axiscareMatch={residentRelationshipDetail.axiscareMatch}
              correction={residentRelationshipDetail.projection.correction}
              hasConflict={residentRelationshipDetail.projection.hasConflict}
              canResolveIdentity={canResolveIdentity}
              canCorrectRelationship={canEditProfile}
              openDuplicateCandidateId={openDuplicateCandidate?.id ?? null}
              scrollAnchorId="identity-resolution"
            />
          </div>
        )}

        <div className="space-y-6">
          {/* B — Relationship / CRM summary. Renders nothing when no
              relationship record exists yet — "Add to Prospect Pipeline"
              (in the Work With This Person strip's More menu) is the
              creation entry point instead of a prominent empty card. */}
          {primaryRelationship && (
            <ResidentRelationshipSummary
              residentId={id}
              residentDisplayName={record.residentDisplayName}
              relationship={primaryRelationship}
              nextAction={openRelationshipAction}
              recentNote={recentWorkingNote}
            />
          )}

          {/* Current Picture — what's true right now and what's in motion.
              Promoted to primary visibility per the resident-profile UX
              simplification; the full Timeline and full Wellness history
              live under Record & History below instead. */}
          <CurrentPicture
            residentId={id}
            currentNeeds={currentNeeds}
            workingNotes={workingNotes}
            wellnessNotes={wellnessNotes}
            openFollowUps={openFollowUps}
          />

          {/* C — Client Readiness. Collapsed by default (this is a CRM/
              working-memory profile first) — the requirement cards ARE
              the work queue once opened, no separate Needs Attention
              checklist duplicating them. */}
          {canManageEvidence && clientReadiness && (
            <ClientReadinessSection
              isOutsidePopulation={clientReadinessOutsidePopulation}
              applicableCount={clientReadinessApplicable.length}
              satisfiedCount={clientReadinessSatisfiedCount}
              defaultOpen={Boolean(selectedRequirementCode)}
            >
              <ClientReadinessBoard
                residentId={id}
                items={clientReadinessBoardItems}
                canManage={canManageEvidence}
                canViewDocuments={canManageEvidence}
                initialSelectedCode={selectedRequirementCode}
                careContacts={{
                  physicianName: resident.physician_name ?? "",
                  physicianPhone: resident.physician_phone ?? "",
                  guardianName: resident.legal_guardian_name ?? "",
                  guardianPhone: resident.legal_guardian_phone ?? "",
                  guardianConfirmedNone,
                }}
                triageDetail={triageDetail}
                triageHistory={triageHistory}
              />
            </ClientReadinessSection>
          )}

          {/* D — Essential client details */}
          <ResidentEssentials
            residentId={id}
            canEdit={canEditProfile}
            contactName={contactName}
            contactRelationship={resident.family_contact_relationship ?? ""}
            contactPhone={resident.family_contact_phone ?? ""}
            contactEmail={resident.family_contact_email ?? ""}
            physicianName={resident.physician_name ?? ""}
            physicianPhone={resident.physician_phone ?? ""}
            guardianName={resident.legal_guardian_name ?? ""}
            guardianPhone={resident.legal_guardian_phone ?? ""}
            guardianConfirmedNone={guardianConfirmedNone}
            initialEditingTarget={initialEditingTarget}
            currentNeedsContent={currentNeeds?.content ?? null}
            assessmentStatus={assessmentReadinessStatus}
            ispStatus={ispStatus}
            residentPageHref={residentPageHref}
          />

          {/* About This Person — collapsed by default; a compact summary
              stands in for the four largely-empty category boxes this used
              to always render. Full content (personal details, interests,
              milestones, capture forms) is unchanged behind the expand. */}
          <CollapsibleSection title="About This Person" description={summarizeGettingToKnow(connections)}>
            <GettingToKnow residentId={id} connections={connections} />
          </CollapsibleSection>

          {/* E — Record & History. Everything detail-heavy or
              provenance-oriented, preserved in full but collapsed by
              default. */}
          <CollapsibleSection
            title="Record &amp; History"
            description="Timeline, assessments, documents, imported source data, and provenance — kept for auditability, not primary work."
          >
            <div id="timeline">
              <ResidentTimeline events={timelineEvents} />
            </div>

            <AssessmentSection residentId={id} residentName={record.residentDisplayName} sessions={assessmentSessions} />

            <WellnessNotes residentId={id} notes={wellnessNotes} openFollowUps={openFollowUps} />

            {canManageEvidence && (
              <div>
                <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Documents &amp; Evidence</p>
                <ResidentEvidenceSection residentId={id} canManage={canManageEvidence} documents={residentDocuments} evidence={residentEvidence} />
              </div>
            )}

            <div>
              <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Resident Profile</p>
              <ResidentProfileCard
                residentId={id}
                canEdit={canEditProfile}
                fullName={record.residentName}
                location={location}
                residentType={record.residentType}
                serviceModel={record.importedServiceModel}
                residentStatus={resident.status}
                needsReview={record.needsReview}
                sourceSystem={resident.source_system}
                lastSyncedAt={record.updatedAt ?? record.createdAt}
                initialPreferredName={connections.profile?.preferred_name ?? ""}
                initialEmail={resident.email ?? ""}
                initialPhone={resident.phone ?? ""}
                initialDateOfBirth={resident.date_of_birth}
                initialDateOfAdmission={resident.date_of_admission}
                initialPreferredLanguage={resident.preferred_language ?? ""}
                initialMobility={resident.mobility ?? ""}
              />
            </div>

            {residentRelationshipDetail && canEditProfile && (
              <div>
                <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                  Identity &amp; Relationship Provenance
                </p>
                <p className="mb-2 font-sans text-sm text-muted">
                  Manually correct this person&rsquo;s recorded Serve relationship. Only needed when the computed value is
                  genuinely wrong for a reason evidence can&rsquo;t capture.
                </p>
                <ServeRelationshipCorrectionControl
                  residentId={id}
                  currentValue={residentRelationshipDetail.projection.relationship}
                />
              </div>
            )}

            {record.importReviewNotes.length > 0 && (
              <div>
                <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Review Notes</p>
                <div className="space-y-2">
                  {record.importReviewNotes.map((note) => (
                    <p key={note} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4 font-sans text-sm leading-relaxed text-body">
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {record.sourceNameDiffers && (
              <div>
                <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Source Identity Review</p>
                <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
                  <p className="font-sans text-sm font-semibold text-body">Source name differs from resident roster</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3">
                    <Field label="Resident Roster Name" value={record.residentName} />
                    <Field label="Source Name" value={record.sourceDisplayName ?? "-"} />
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Imported Contacts</p>
              {record.importedContacts.length > 0 ? (
                <div className="space-y-4">
                  {record.importedContacts.map((contact, index) => {
                    const importedName =
                      contact.contact_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed Contact";

                    return (
                      <div key={contact.id ?? `${importedName}-${index}`} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
                        <div className="mb-3 flex items-center justify-between gap-4">
                          <p className="font-sans text-base font-semibold text-body">{importedName}</p>
                          {contact.is_primary && <Badge tone="gold">Primary</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                          <Field label="Relationship" value={titleCase(contact.relationship ?? null)} />
                          <Field label="Source" value={contact.source_system ?? "Imported"} />
                          <Field label="Phone" value={formatPhone(contact.phone ?? null)} />
                          <Field label="Email" value={contact.email ?? "-"} />
                          <Field label="Imported" value={compactDate(contact.imported_at || contact.updated_at || contact.created_at)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="font-sans text-sm text-muted">No imported contact records are attached to this resident yet.</p>
              )}
            </div>

            <div>
              <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Resident Source</p>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <Field label="Community" value={resident.community_name ?? "-"} />
                  <Field label="Community Code" value={resident.community_code ?? "-"} />
                  <Field label="Source System" value={resident.source_system ?? "-"} />
                  <Field label="Source Status" value={titleCase(resident.source_status)} />
                  <Field label="Staged Serve Status" value={record.sourceRelationshipStatus ? titleCase(record.sourceRelationshipStatus) : "-"} />
                  <Field label="Imported Cinch Status" value={titleCase(record.sourceCinchStatus)} />
                  <Field label="Imported Service Model" value={titleCase(record.sourceServiceType)} />
                  <Field label="Source Display Name" value={record.sourceDisplayName ?? "-"} />
                  <Field label="Source Full Name" value={record.sourceFullName ?? "-"} />
                  <Field label="Imported Relationship" value={titleCase(resident.relationship_status)} />
                  <Field label="Import Batch" value={resident.import_batch ?? "-"} />
                  <Field label="Source File" value={resident.source_file ?? "-"} />
                </div>

                {resident.care_needs && (
                  <div>
                    <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Care Needs (legacy import)</p>
                    <p className="rounded-lg border border-ivory-border bg-ivory px-5 py-4 font-sans text-base leading-relaxed text-body">
                      {resident.care_needs}
                    </p>
                  </div>
                )}

                {resident.notes && (
                  <div>
                    <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Notes (legacy import)</p>
                    <p className="rounded-lg border border-ivory-border bg-ivory px-5 py-4 font-sans text-base leading-relaxed text-body">
                      {resident.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Imported Relationship History</p>
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
                      <div key={relationship.id ?? `${importedStatus}-${index}`} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                          <Field label="Imported Status" value={titleCase(importedStatus)} />
                          <Field label="Source" value={relationship.source_system ?? "Imported"} />
                          <Field
                            label="Service Model"
                            value={titleCase(relationship.service_model || relationship.service_type || relationship.care_model || null)}
                          />
                          <Field
                            label="Effective"
                            value={compactDate(
                              relationship.effective_date || relationship.start_date || relationship.imported_at || relationship.updated_at || relationship.created_at
                            )}
                          />
                          <Field label="Ended" value={compactDate(relationship.end_date)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="font-sans text-sm text-muted">No imported relationship records are attached to this resident yet.</p>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </PageContainer>
  );
}
