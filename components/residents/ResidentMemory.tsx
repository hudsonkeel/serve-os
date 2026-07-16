import {
  ResidentCurrentNeeds as ResidentCurrentNeedsRecord,
  ResidentTimelineEvent,
  ResidentWorkingNote,
} from "@/lib/supabase/types";
import { ResidentCurrentNeeds } from "./ResidentCurrentNeeds";
import { ResidentWorkingNotes } from "./ResidentWorkingNotes";
import { ResidentTimeline } from "./ResidentTimeline";

interface ResidentMemoryProps {
  residentId: string;
  currentNeeds: ResidentCurrentNeedsRecord | null;
  workingNotes: ResidentWorkingNote[];
  timelineEvents: ResidentTimelineEvent[];
}

// The resident-memory container: Current Needs (how do we care for them?),
// Working Notes (what are we working on?), and Timeline (what happened?)
// rendered as one visually distinct subsystem — deliberately given a
// heavier header than the small-caps Section labels used elsewhere on the
// Resident Profile page, so it reads as its own major section rather than
// another field group. One card with internal dividers, not three stacked
// cards, so the three layers read together instead of as separate features.
export function ResidentMemory({
  residentId,
  currentNeeds,
  workingNotes,
  timelineEvents,
}: ResidentMemoryProps) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
      <div className="border-b border-ivory-border px-6 py-5">
        <h2 className="font-serif text-card-title font-light text-body">
          Resident Memory
        </h2>
        <p className="mt-1 max-w-2xl font-sans text-sm text-subtle">
          How we care for this resident, what is currently in motion, and
          what has happened over time.
        </p>
        <p className="mt-2 font-sans text-sm font-medium text-muted">
          Every Visit · In Progress · History
        </p>
      </div>

      <div className="divide-y divide-ivory-border">
        <div id="current-needs" className="p-6">
          <ResidentCurrentNeeds
            residentId={residentId}
            currentNeeds={currentNeeds}
          />
        </div>
        <div id="working-notes" className="p-6">
          <ResidentWorkingNotes residentId={residentId} notes={workingNotes} />
        </div>
        <div id="timeline" className="p-6">
          <ResidentTimeline events={timelineEvents} />
        </div>
      </div>
    </div>
  );
}
