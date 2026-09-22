import { Badge } from "@/components/ui/Badge";
import type { ImportantPeopleReviewData, CurrentImportantPersonView } from "@/lib/actions/importantPeople";
import { operationalRoleLabel, presentPersonRoles } from "@/lib/contacts/importantPeoplePresentation";

// Slice C.3 refinement (2026-09-19) — safe, unambiguous knowledge from an approved assessment is
// now projected into canonical Important People automatically (lib/actions/importantPeople.ts);
// there is nothing left for this panel to ask a human to confirm in the ordinary case, so it is a
// plain read-only server component with no client-side state, transitions, or buttons. The only
// thing a person can do here is notice a "Needs review" item — and even that has no action wired
// up yet (see the action file's own header comment on why a warning affordance without a real
// destination is worse than a restrained status line).

function PersonCard({ person }: { person: CurrentImportantPersonView }) {
  const { relationshipLabels, operationalRoles, authorityRoles } = presentPersonRoles(person.roles);
  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
      <p className="font-sans text-base font-semibold text-body">
        {[person.firstName, person.lastName].filter(Boolean).join(" ") || "(name not on file)"}
      </p>
      {relationshipLabels.length > 0 && (
        <p className="font-sans text-sm text-muted">{relationshipLabels.join(" / ")}</p>
      )}
      {operationalRoles.length > 0 && (
        <p className="mt-1 font-sans text-sm text-body">
          {operationalRoles.map((r) => operationalRoleLabel(r.roleType)).join(" · ")}
        </p>
      )}
      {person.phone && <p className="mt-1 font-sans text-sm text-body">{person.phone}</p>}
      {authorityRoles.map((r) => {
        const verified = r.status === "verified";
        return (
          <p key={r.roleType} className="mt-1 flex items-center gap-2 font-sans text-sm text-body">
            <span>{operationalRoleLabel(r.roleType)}</span>
            <Badge tone={verified ? "success" : "neutral"}>{verified ? "Verified" : "Unverified"}</Badge>
          </p>
        );
      })}
      {person.mostRecentAssessmentDate && (
        <p className="mt-2 font-sans text-xs text-subtle">From {person.mostRecentAssessmentDate} assessment</p>
      )}
    </div>
  );
}

export function ImportantPeoplePanel({ initialData }: { initialData: ImportantPeopleReviewData }) {
  const { currentPeople, needsReview, unattachedPoaClaims } = initialData;

  if (currentPeople.length === 0 && needsReview.length === 0 && unattachedPoaClaims.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-muted">Important People</h3>

      {currentPeople.length > 0 && (
        <div className="space-y-3">
          {currentPeople.map((person) => (
            <PersonCard key={person.contactId} person={person} />
          ))}
        </div>
      )}

      {needsReview.length > 0 && (
        <div className={currentPeople.length > 0 ? "mt-4 space-y-2" : "space-y-2"}>
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-muted">Needs review</p>
          {needsReview.map((person) => (
            <div key={person.proposalKey} className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
              <p className="font-sans text-sm font-semibold text-body">{person.rawFullName}</p>
              <p className="mt-0.5 font-sans text-xs text-muted">{person.reason}</p>
            </div>
          ))}
        </div>
      )}

      {unattachedPoaClaims.length > 0 && (
        <p className="mt-3 font-sans text-xs text-muted">
          The assessment also reported {unattachedPoaClaims.length === 1 ? "a" : unattachedPoaClaims.length}{" "}
          power of attorney but did not identify a specific decision maker to attach it to.
        </p>
      )}
    </div>
  );
}
