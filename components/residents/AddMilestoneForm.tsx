"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMilestone } from "@/lib/actions/connections";
import { MilestoneType } from "@/lib/supabase/types";

const MILESTONE_TYPE_OPTIONS: { value: MilestoneType; label: string }[] = [
  { value: "birthday", label: "Birthday" },
  { value: "wedding_anniversary", label: "Wedding Anniversary" },
  { value: "military_anniversary", label: "Military Anniversary" },
  { value: "graduation", label: "Graduation" },
  { value: "move_in_anniversary", label: "Move-In Anniversary" },
  { value: "bereavement_remembrance", label: "Bereavement Remembrance" },
  { value: "religious_observance", label: "Religious Observance" },
  { value: "personal_accomplishment", label: "Personal Accomplishment" },
  { value: "custom", label: "Custom" },
];

type SubmitState = "idle" | "submitting" | "success" | "error";

export function AddMilestoneForm({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [milestoneType, setMilestoneType] = useState<MilestoneType>("birthday");
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [yearKnown, setYearKnown] = useState(false);
  const [appropriateForOutreach, setAppropriateForOutreach] = useState(false);
  const [notes, setNotes] = useState("");

  function resetFields() {
    setMilestoneType("birthday");
    setTitle("");
    setMonth("");
    setDay("");
    setYearKnown(false);
    setAppropriateForOutreach(false);
    setNotes("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setStatus("error");
      setError("Give this important date a title.");
      return;
    }

    const monthNum = month ? Number(month) : undefined;
    const dayNum = day ? Number(day) : undefined;

    if (!monthNum && !dayNum) {
      setStatus("error");
      setError("Enter at least a month or day.");
      return;
    }

    setStatus("submitting");
    startTransition(async () => {
      const result = await addMilestone({
        residentId,
        milestoneType,
        title,
        month: monthNum,
        day: dayNum,
        yearKnown,
        sourceType: "staff_conversation",
        appropriateForOutreach,
        notes,
      });

      if (result.error) {
        setStatus("error");
        setError(result.error);
        return;
      }

      setStatus("success");
      resetFields();
      router.refresh();
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
        Add Important Date
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
          Add Important Date
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
        <div>
          <label
            htmlFor="milestone-type"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Type
          </label>
          <select
            id="milestone-type"
            value={milestoneType}
            onChange={(e) => setMilestoneType(e.target.value as MilestoneType)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {MILESTONE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="milestone-title"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Title
          </label>
          <input
            id="milestone-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Birthday"
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label
            htmlFor="milestone-month"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Month
          </label>
          <input
            id="milestone-month"
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          />
        </div>
        <div>
          <label
            htmlFor="milestone-day"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Day
          </label>
          <input
            id="milestone-day"
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="milestone-notes"
          className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
        >
          Notes (optional)
        </label>
        <textarea
          id="milestone-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-sans text-sm text-body">
          <input
            type="checkbox"
            checked={yearKnown}
            onChange={(e) => setYearKnown(e.target.checked)}
            className="h-4 w-4 rounded border-ivory-border"
          />
          Year is known
        </label>
        <label className="flex items-center gap-2 font-sans text-sm text-body">
          <input
            type="checkbox"
            checked={appropriateForOutreach}
            onChange={(e) => setAppropriateForOutreach(e.target.checked)}
            className="h-4 w-4 rounded border-ivory-border"
          />
          Appropriate for follow-up
        </label>
      </div>

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
          Important date saved.
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
        {isPending ? "Saving..." : "Save Important Date"}
      </button>
    </form>
  );
}
