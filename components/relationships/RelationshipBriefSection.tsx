import type { RelationshipBrief } from "@/lib/relationships/brief";

// Read-only render of a deterministically generated Relationship Brief.
// Every non-uncertainty sentence traces to a source record — see
// docs/architecture/relationship-intelligence-phase-1-implementation.md's
// "Grounding rules." Correct facts at their source (Interactions,
// Insights, Commitments, Open Loops), never by editing this view — there
// is nothing here to edit; it's regenerated fresh on every page load.

function SectionBlock({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">{heading}</p>
      <p className="mt-1 font-sans text-sm text-body">{body}</p>
    </div>
  );
}

interface RelationshipBriefSectionProps {
  brief: RelationshipBrief;
}

export function RelationshipBriefSection({ brief }: RelationshipBriefSectionProps) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-serif text-card-title font-light text-body">Relationship Brief</h2>
        <span className="font-sans text-xs text-subtle">
          Generated {new Date(brief.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <div className="space-y-4">
        <SectionBlock heading={brief.context.heading} body={brief.context.body} />
        <SectionBlock heading={brief.whatMatters.heading} body={brief.whatMatters.body} />
        <SectionBlock heading={brief.currentGoal.heading} body={brief.currentGoal.body} />
      </div>

      <div className="mt-6 rounded-lg border border-gold/30 bg-gold-subtle/40 p-4">
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-gold-dark">
          Recommended Follow-Up
        </p>
        <div className="mt-2 space-y-2 font-sans text-sm text-body">
          <p>
            <span className="font-semibold">Opening: </span>
            {brief.recommendedFollowUp.opening}
          </p>
          <p>
            <span className="font-semibold">Primary Question: </span>
            {brief.recommendedFollowUp.primaryQuestion}
          </p>
          <p>
            <span className="font-semibold">Suggested Next Step: </span>
            {brief.recommendedFollowUp.suggestedNextStep}
          </p>
        </div>
      </div>

      {brief.basedOn.length > 0 && (
        <div className="mt-4 border-t border-ivory-border pt-3">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Based On</p>
          <ul className="mt-1 space-y-0.5 font-sans text-xs text-muted">
            {brief.basedOn.map((ref) => (
              <li key={`${ref.kind}:${ref.id}`}>{ref.label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
