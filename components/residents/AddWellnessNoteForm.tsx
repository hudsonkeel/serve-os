"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWellnessNote } from "@/lib/actions/wellnessNotes";
import {
  suggestedDueDateValue,
  suggestWellnessFollowUps,
} from "@/lib/residentWellness/followUpRules";
import {
  WellnessFollowUpType,
  WellnessNotePriority,
  WellnessSignalType,
} from "@/lib/supabase/types";

const SIGNAL_LABELS: Record<WellnessSignalType, string> = {
  general_wellness: "General Wellness",
  mobility: "Mobility",
  fall_risk: "Fall Risk",
  injury: "Recent Injury",
  pain: "Pain",
  medication: "Medication",
  nutrition_hydration: "Nutrition / Hydration",
  cognition: "Cognition",
  mood_behavior: "Mood / Behavior",
  sleep: "Sleep",
  personal_care: "Personal Care",
  continence: "Continence",
  sensory_change: "Sensory Change",
  hospital_rehab: "Hospital / Rehab",
  surgery_procedure: "Surgery / Procedure",
  return_from_rehab: "Return From Rehab",
  change_in_service_need: "Change in Service Need",
  environment_safety: "Environment / Safety",
  bathroom_safety: "Bathroom Safety",
  equipment: "Equipment",
  home_modification: "Home Modification",
  accessibility: "Accessibility",
  social_engagement: "Social Engagement",
  isolation: "Isolation",
  family_update: "Family Update",
  resident_preference: "Resident Preference",
  care_resistance: "Care Resistance",
  missed_task: "Missed Task",
  caregiver_concern: "Caregiver Concern",
  follow_up_needed: "Follow-Up Needed",
  other: "Other",
};

const SIGNAL_GROUPS: { heading: string; signals: WellnessSignalType[] }[] = [
  {
    heading: "Health & Function",
    signals: [
      "general_wellness",
      "mobility",
      "fall_risk",
      "injury",
      "pain",
      "medication",
      "nutrition_hydration",
      "cognition",
      "mood_behavior",
      "sleep",
      "personal_care",
      "continence",
      "sensory_change",
    ],
  },
  {
    heading: "Care Transitions",
    signals: [
      "hospital_rehab",
      "surgery_procedure",
      "return_from_rehab",
      "change_in_service_need",
    ],
  },
  {
    heading: "Environment & Safety",
    signals: [
      "environment_safety",
      "bathroom_safety",
      "equipment",
      "home_modification",
      "accessibility",
    ],
  },
  {
    heading: "Social & Family",
    signals: ["social_engagement", "isolation", "family_update", "resident_preference"],
  },
  {
    heading: "Operational",
    signals: [
      "care_resistance",
      "missed_task",
      "caregiver_concern",
      "follow_up_needed",
      "other",
    ],
  },
];

const PRIORITY_OPTIONS: { value: WellnessNotePriority; label: string }[] = [
  { value: "routine", label: "Routine" },
  { value: "monitor", label: "Monitor" },
  { value: "important", label: "Important" },
  { value: "urgent", label: "Urgent" },
];

const FOLLOW_UP_TYPE_OPTIONS: { value: WellnessFollowUpType; label: string }[] = [
  { value: "reassessment", label: "Reassessment" },
  { value: "resident_check_in", label: "Resident Check-In" },
  { value: "family_update", label: "Family Update" },
  { value: "safety_review", label: "Safety Review" },
  { value: "medication_review", label: "Medication Review" },
  { value: "mobility_review", label: "Mobility Review" },
  { value: "equipment_review", label: "Equipment Review" },
  { value: "care_coordination", label: "Care Coordination" },
  { value: "service_review", label: "Service Review" },
  { value: "documentation", label: "Documentation" },
  { value: "other", label: "Other" },
];

type SubmitState = "idle" | "submitting" | "success" | "error";
type CandidateDecision = "pending" | "accepted" | "dismissed";
type CandidateField =
  | "title"
  | "description"
  | "followUpType"
  | "dueDate"
  | "priority"
  | "assignedTo";

interface FollowUpCandidate {
  key: string;
  ruleId: string | null;
  title: string;
  description: string;
  followUpType: WellnessFollowUpType;
  dueDate: string;
  priority: WellnessNotePriority;
  assignedTo: string;
  reason: string | null;
  decision: CandidateDecision;
}

function nowForDateTimeInput(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

function FollowUpFields({
  candidate,
  onChange,
}: {
  candidate: FollowUpCandidate;
  onChange: (field: CandidateField, value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Title
        </span>
        <input
          type="text"
          value={candidate.title}
          onChange={(e) => onChange("title", e.target.value)}
          className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Description (optional)
        </span>
        <textarea
          value={candidate.description}
          onChange={(e) => onChange("description", e.target.value)}
          rows={2}
          className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Type
          </span>
          <select
            value={candidate.followUpType}
            onChange={(e) => onChange("followUpType", e.target.value)}
            className="w-full rounded-md border border-ivory-border bg-surface px-2.5 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {FOLLOW_UP_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Due
          </span>
          <input
            type="date"
            value={candidate.dueDate}
            onChange={(e) => onChange("dueDate", e.target.value)}
            className="w-full rounded-md border border-ivory-border bg-surface px-2.5 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Priority
          </span>
          <select
            value={candidate.priority}
            onChange={(e) => onChange("priority", e.target.value)}
            className="w-full rounded-md border border-ivory-border bg-surface px-2.5 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Assigned To
          </span>
          <input
            type="text"
            value={candidate.assignedTo}
            onChange={(e) => onChange("assignedTo", e.target.value)}
            placeholder="Optional"
            className="w-full rounded-md border border-ivory-border bg-surface px-2.5 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>
      </div>
    </div>
  );
}

interface AddWellnessNoteFormProps {
  residentId: string;
  // Skips the collapsed "Add Wellness Observation" button and renders the
  // form open immediately — used by the dedicated Quick Action workflow,
  // where opening the form is the entire point of the page.
  defaultOpen?: boolean;
  // Called after a successful save (in addition to the form's own inline
  // success message) — used by the Quick Action workflow to surface a link
  // back to the resident's detail page.
  onSaved?: () => void;
}

export function AddWellnessNoteForm({
  residentId,
  defaultOpen = false,
  onSaved,
}: AddWellnessNoteFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [observedAt, setObservedAt] = useState(nowForDateTimeInput());
  const [selectedSignals, setSelectedSignals] = useState<WellnessSignalType[]>([]);
  const [observation, setObservation] = useState("");
  const [context, setContext] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [priority, setPriority] = useState<WellnessNotePriority>("routine");

  const [suggestedCandidates, setSuggestedCandidates] = useState<FollowUpCandidate[]>(
    []
  );
  const [manualCandidates, setManualCandidates] = useState<FollowUpCandidate[]>([]);
  const [hasReviewed, setHasReviewed] = useState(false);

  function toggleSignal(signal: WellnessSignalType) {
    setSelectedSignals((prev) =>
      prev.includes(signal) ? prev.filter((s) => s !== signal) : [...prev, signal]
    );
  }

  function resetFields() {
    setObservedAt(nowForDateTimeInput());
    setSelectedSignals([]);
    setObservation("");
    setContext("");
    setActionTaken("");
    setPriority("routine");
    setSuggestedCandidates([]);
    setManualCandidates([]);
    setHasReviewed(false);
  }

  // Deterministic only — no LLM. Recomputing wholesale on click (rather than
  // auto-recalculating as signals change) avoids distracting the user while
  // they're still typing the observation.
  function handleReviewSuggestions() {
    const suggestions = suggestWellnessFollowUps({
      signals: selectedSignals,
      observationPriority: priority,
    });

    setSuggestedCandidates(
      suggestions.map((suggestion) => ({
        key: suggestion.ruleId,
        ruleId: suggestion.ruleId,
        title: suggestion.title,
        description: suggestion.description ?? "",
        followUpType: suggestion.followUpType,
        dueDate: suggestedDueDateValue(observedAt, suggestion.suggestedDueDays),
        priority: suggestion.priority,
        assignedTo: "",
        reason: suggestion.reason,
        decision: "pending",
      }))
    );
    setHasReviewed(true);
  }

  function handleAddManualCandidate() {
    setManualCandidates((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}-${prev.length}`,
        ruleId: null,
        title: "",
        description: "",
        followUpType: "other",
        dueDate: "",
        priority: "routine",
        assignedTo: "",
        reason: null,
        decision: "accepted",
      },
    ]);
  }

  function updateSuggested(key: string, field: CandidateField, value: string) {
    setSuggestedCandidates((prev) =>
      prev.map((c) => (c.key === key ? { ...c, [field]: value } : c))
    );
  }

  function updateManual(key: string, field: CandidateField, value: string) {
    setManualCandidates((prev) =>
      prev.map((c) => (c.key === key ? { ...c, [field]: value } : c))
    );
  }

  function setSuggestedDecision(key: string, decision: CandidateDecision) {
    setSuggestedCandidates((prev) =>
      prev.map((c) => (c.key === key ? { ...c, decision } : c))
    );
  }

  function removeManualCandidate(key: string) {
    setManualCandidates((prev) => prev.filter((c) => c.key !== key));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!observation.trim()) {
      setStatus("error");
      setError("Describe what was observed.");
      return;
    }

    if (selectedSignals.length === 0) {
      setStatus("error");
      setError("Select at least one wellness signal.");
      return;
    }

    // Rule-suggested follow-ups only save if explicitly accepted; manual
    // ones are accepted by construction the moment staff adds them. Neither
    // is ever saved silently.
    const acceptedCandidates = [
      ...suggestedCandidates.filter((c) => c.decision === "accepted"),
      ...manualCandidates,
    ];

    const missingTitle = acceptedCandidates.find((c) => !c.title.trim());
    if (missingTitle) {
      setStatus("error");
      setError("Give every accepted follow-up a title before saving.");
      return;
    }

    setStatus("submitting");
    startTransition(async () => {
      const result = await addWellnessNote({
        residentId,
        observedAt,
        signalTypes: selectedSignals,
        observation,
        context,
        actionTaken,
        priority,
        acceptedFollowUps: acceptedCandidates.map((c) => ({
          ruleId: c.ruleId,
          title: c.title,
          description: c.description,
          followUpType: c.followUpType,
          dueDate: c.dueDate,
          assignedTo: c.assignedTo,
          priority: c.priority,
        })),
      });

      if (result.error) {
        setStatus("error");
        setError(result.error);
        return;
      }

      setStatus("success");
      resetFields();
      router.refresh();
      onSaved?.();
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setStatus("idle");
          setError(null);
        }}
        className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
      >
        Add Wellness Observation
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-ivory-border bg-ivory px-4 py-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm font-semibold uppercase tracking-widest text-muted">
          Add Wellness Observation
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="font-sans text-sm text-muted transition-colors hover:text-body"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Observed
          </span>
          <input
            type="datetime-local"
            value={observedAt}
            onChange={(e) => setObservedAt(e.target.value)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Priority
          </span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as WellnessNotePriority)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Observation
        </span>
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={2}
          placeholder="What was observed?"
          className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Context (optional)
          </span>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Action Taken (optional)
          </span>
          <textarea
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Wellness Signals
          </span>
          <span className="font-sans text-label text-subtle">
            Select at least one
          </span>
        </div>

        {selectedSignals.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedSignals.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center gap-1 rounded-full bg-gold-subtle px-2.5 py-1 font-sans text-sm font-medium text-gold-dark"
              >
                {SIGNAL_LABELS[signal]}
                <button
                  type="button"
                  onClick={() => toggleSignal(signal)}
                  aria-label={`Remove ${SIGNAL_LABELS[signal]}`}
                  className="text-gold-dark/70 hover:text-gold-dark"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="max-h-56 space-y-2.5 overflow-y-auto rounded-md border border-ivory-border bg-surface p-3">
          {SIGNAL_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                {group.heading}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.signals.map((signal) => {
                  const isSelected = selectedSignals.includes(signal);
                  return (
                    <button
                      key={signal}
                      type="button"
                      onClick={() => toggleSignal(signal)}
                      aria-pressed={isSelected ? "true" : "false"}
                      className={`rounded-full border px-2.5 py-1 font-sans text-sm transition-colors ${
                        isSelected
                          ? "border-gold/50 bg-gold-subtle font-medium text-gold-dark"
                          : "border-ivory-border bg-surface text-muted hover:border-navy/20 hover:text-body"
                      }`}
                    >
                      {SIGNAL_LABELS[signal]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-ivory-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReviewSuggestions}
            disabled={selectedSignals.length === 0}
            className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review suggested follow-ups
          </button>
          <button
            type="button"
            onClick={handleAddManualCandidate}
            className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
          >
            Add custom follow-up
          </button>
        </div>

        {hasReviewed &&
          suggestedCandidates.length === 0 &&
          manualCandidates.length === 0 && (
            <p className="font-sans text-sm text-subtle">
              No follow-up suggestions for the selected signals. You can still
              add a custom follow-up above.
            </p>
          )}

        {(suggestedCandidates.length > 0 || manualCandidates.length > 0) && (
          <div className="space-y-2">
            {suggestedCandidates.map((candidate) => (
              <div
                key={candidate.key}
                className={`rounded-lg border px-3 py-3 ${
                  candidate.decision === "accepted"
                    ? "border-gold/50 bg-gold-subtle/30"
                    : candidate.decision === "dismissed"
                      ? "border-ivory-border bg-ivory opacity-60"
                      : "border-ivory-border bg-surface"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                      {candidate.decision === "accepted"
                        ? "Accepted"
                        : candidate.decision === "dismissed"
                          ? "Dismissed"
                          : "Suggested"}
                    </p>
                    {candidate.reason && (
                      <p className="mt-0.5 font-sans text-sm italic text-muted">
                        Why: {candidate.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSuggestedDecision(candidate.key, "accepted")}
                      className={`rounded-md px-2 py-1 font-sans text-sm font-medium transition-colors ${
                        candidate.decision === "accepted"
                          ? "bg-navy text-white"
                          : "border border-ivory-border text-body hover:border-navy/20"
                      }`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestedDecision(candidate.key, "dismissed")}
                      className={`rounded-md px-2 py-1 font-sans text-sm font-medium transition-colors ${
                        candidate.decision === "dismissed"
                          ? "bg-ivory-warm text-muted"
                          : "border border-ivory-border text-body hover:border-navy/20"
                      }`}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <FollowUpFields
                  candidate={candidate}
                  onChange={(field, value) => updateSuggested(candidate.key, field, value)}
                />
              </div>
            ))}

            {manualCandidates.map((candidate) => (
              <div
                key={candidate.key}
                className="rounded-lg border border-gold/50 bg-gold-subtle/30 px-3 py-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                    Custom Follow-Up
                  </p>
                  <button
                    type="button"
                    onClick={() => removeManualCandidate(candidate.key)}
                    className="font-sans text-sm text-muted transition-colors hover:text-body"
                  >
                    Remove
                  </button>
                </div>
                <FollowUpFields
                  candidate={candidate}
                  onChange={(field, value) => updateManual(candidate.key, field, value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
          Wellness observation saved.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save Wellness Observation"}
      </button>
    </form>
  );
}
