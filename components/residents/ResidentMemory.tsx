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
        <p className="mt-1 font-sans text-sm text-subtle">
          Institutional knowledge about this resident — how we care for
          them, what&apos;s currently in motion, and what&apos;s happened.
        </p>
      </div>

      <div className="divide-y divide-ivory-border">
        <div className="p-6">
          <ResidentCurrentNeeds
            residentId={residentId}
            currentNeeds={currentNeeds}
          />
        </div>
        <div className="p-6">
          <ResidentWorkingNotes residentId={residentId} notes={workingNotes} />
        </div>
        <div className="p-6">
          <ResidentTimeline events={timelineEvents} />
        </div>
      </div>
    </div>
  );
}
