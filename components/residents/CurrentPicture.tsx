import {
  ResidentCurrentNeeds as ResidentCurrentNeedsRecord,
  ResidentWellnessNote,
  ResidentWorkingNote,
} from "@/lib/supabase/types";
import { OpenWellnessFollowUp } from "@/lib/data/wellnessFollowUps";
import { ResidentCurrentNeeds } from "./ResidentCurrentNeeds";
import { ResidentWorkingNotes } from "./ResidentWorkingNotes";
import { Badge } from "@/components/ui/Badge";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Present only where a real, non-routine wellness signal exists — never a
// placeholder. Deliberately reads the SAME wellnessNotes data the full
// WellnessNotes section (Record & History) already fetches; this is a
// condensed presentational slot over that data, not a second data source.
//
// Extension point: this is where future analysis of assessments, task
// sheets, care notes, wellbeing observations, current needs, working
// notes, ISP, and significant changes should surface concise signals —
// "Capture -> Understand -> Recommend -> Human acts." A future signal
// generator can populate more/ranked items into this same slot without
// growing the page; it must never silently alter care plans or make
// governed care decisions on its own.
function RecentSignal({ wellnessNotes }: { wellnessNotes: ResidentWellnessNote[] }) {
  const signal = wellnessNotes.find((note) => note.priority !== "routine");
  if (!signal) return null;

  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Recent Signal
        </h4>
        <Badge tone={signal.priority === "urgent" ? "danger" : "gold"}>{signal.priority}</Badge>
      </div>
      <p className="font-sans text-sm text-body">{signal.observation}</p>
      <p className="mt-1 font-sans text-xs text-subtle">{compactDate(signal.observed_at)}</p>
    </div>
  );
}

// Same extension-point philosophy as RecentSignal above, over the same
// pre-sorted (overdue, then urgent>important>monitor>routine, then due
// date) follow-up data the Record & History wellness section fetches —
// this just surfaces the top of that ordering. Present only where a real
// open follow-up exists.
function NextRecommendedAction({ openFollowUps }: { openFollowUps: OpenWellnessFollowUp[] }) {
  const next = openFollowUps[0];
  if (!next) return null;

  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Next Recommended Action
        </h4>
        {next.isOverdue && <Badge tone="danger">Overdue</Badge>}
      </div>
      <p className="font-sans text-sm text-body">{next.title}</p>
      {next.due_at && <p className="mt-1 font-sans text-xs text-subtle">Due {compactDate(next.due_at)}</p>}
    </div>
  );
}

interface CurrentPictureProps {
  residentId: string;
  currentNeeds: ResidentCurrentNeedsRecord | null;
  workingNotes: ResidentWorkingNote[];
  wellnessNotes: ResidentWellnessNote[];
  openFollowUps: OpenWellnessFollowUp[];
}

// What's true right now and what's in motion — Current Needs, In Progress,
// and (where real data exists) a recent signal and a next recommended
// action. Historical evidence (Timeline, full assessment/wellness
// history, provenance) lives under Record & History instead; this
// container is deliberately scoped to "current understanding," not "the
// record."
export function CurrentPicture({
  residentId,
  currentNeeds,
  workingNotes,
  wellnessNotes,
  openFollowUps,
}: CurrentPictureProps) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
      <div className="border-b border-ivory-border px-6 py-4">
        <h2 className="font-serif text-card-title font-light text-body">Current Picture</h2>
      </div>

      <div className="divide-y divide-ivory-border">
        {/* Current Needs and Working Notes side-by-side on sufficiently
            wide desktop layouts (lg:) — a plain CSS grid within this same
            card, not a second nested card. Stacked with a horizontal
            divider on narrower/mobile layouts; a vertical divider between
            the two columns once side-by-side. */}
        <div className="grid grid-cols-1 divide-y divide-ivory-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div id="current-needs" className="p-6">
            <ResidentCurrentNeeds residentId={residentId} currentNeeds={currentNeeds} />
          </div>
          <div id="working-notes" className="p-6">
            <ResidentWorkingNotes residentId={residentId} notes={workingNotes} />
          </div>
        </div>
        {(wellnessNotes.some((note) => note.priority !== "routine") || openFollowUps.length > 0) && (
          <div className="grid gap-3 p-6 sm:grid-cols-2">
            <RecentSignal wellnessNotes={wellnessNotes} />
            <NextRecommendedAction openFollowUps={openFollowUps} />
          </div>
        )}
      </div>
    </div>
  );
}
