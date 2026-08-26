"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInfectionAction } from "@/lib/actions/infections";
import { searchResidentsForLinking } from "@/lib/actions/relationships";
import type { ResidentSearchResult } from "@/lib/data/relationships";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

function todayForDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

// Factual-record posture, same as the DB/RPC layer: this form records what
// was disclosed/reported, never a clinical assessment. No diagnosis,
// severity, or reportability field exists here to fill in — see the
// migration header at
// supabase/migrations/20260907000000_create_incidents_and_infections.sql.
export function CreateInfectionForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Client linkage — same search-then-select pattern proven in
  // CreateIncidentForm (searchResidentsForLinking), required here since an
  // infection record is always about a specific client.
  const [residentQuery, setResidentQuery] = useState("");
  const [residentResults, setResidentResults] = useState<ResidentSearchResult[]>([]);
  const [isSearchingResidents, setIsSearchingResidents] = useState(false);
  const [selectedResident, setSelectedResident] = useState<ResidentSearchResult | null>(null);

  const [disclosedAt, setDisclosedAt] = useState(todayForDateInput());
  const [conditionDescription, setConditionDescription] = useState("");
  const [treatmentDescription, setTreatmentDescription] = useState("");
  const [disclosedBy, setDisclosedBy] = useState("");
  const [notes, setNotes] = useState("");

  async function handleResidentSearch(value: string) {
    setResidentQuery(value);
    if (value.trim().length < 2) {
      setResidentResults([]);
      return;
    }
    setIsSearchingResidents(true);
    const found = await searchResidentsForLinking(value);
    setResidentResults(found);
    setIsSearchingResidents(false);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!selectedResident) {
      setError("A client is required for an infection record.");
      return;
    }
    if (!disclosedAt) {
      setError("The date this was disclosed to Serve is required.");
      return;
    }
    if (!conditionDescription.trim()) {
      setError("Infection/condition information as disclosed is required.");
      return;
    }

    startTransition(async () => {
      const res = await createInfectionAction({
        residentId: selectedResident.id,
        disclosedAt,
        conditionDescription: conditionDescription.trim(),
        treatmentDescription: treatmentDescription.trim() || null,
        disclosedBy: disclosedBy.trim() || null,
        followUpRequired: false,
        owner: null,
        notes: notes.trim() || null,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.infection) {
        router.push(`/qapi/infections/${res.infection.id}`);
      } else {
        router.push("/qapi/infections");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Client</h2>

        {selectedResident ? (
          <p className="mt-3 font-sans text-sm text-body">
            {selectedResident.name}
            {selectedResident.unitNumber ? ` — Unit ${selectedResident.unitNumber}` : ""}{" "}
            <button
              type="button"
              onClick={() => {
                setSelectedResident(null);
                setResidentQuery("");
                setResidentResults([]);
              }}
              className="font-sans text-xs font-medium text-navy hover:text-navy-light"
            >
              Change
            </button>
          </p>
        ) : (
          <div className="mt-3">
            <input
              type="text"
              value={residentQuery}
              onChange={(e) => handleResidentSearch(e.target.value)}
              placeholder="Search by resident name or apartment..."
              className={fieldClassName}
            />
            {isSearchingResidents && <p className="mt-1 font-sans text-xs text-subtle">Searching...</p>}
            {residentResults.length > 0 && (
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-md border border-ivory-border bg-surface">
                {residentResults.map((resident) => (
                  <li key={resident.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedResident(resident);
                        setResidentResults([]);
                        setResidentQuery("");
                      }}
                      className="w-full px-3 py-2 text-left font-sans text-sm text-body hover:bg-ivory-warm"
                    >
                      {resident.name}
                      {resident.unitNumber ? ` — Unit ${resident.unitNumber}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">As Disclosed</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Date Disclosed to Serve</span>
            <input
              type="date"
              value={disclosedAt}
              onChange={(e) => setDisclosedAt(e.target.value)}
              required
              className={fieldClassName}
            />
          </label>

          <label className="block">
            <span className={labelClassName}>Disclosed / Reported By (optional)</span>
            <input
              type="text"
              value={disclosedBy}
              onChange={(e) => setDisclosedBy(e.target.value)}
              placeholder="e.g. Client, family member, caregiver name"
              className={fieldClassName}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className={labelClassName}>Infection / Condition Information (as disclosed)</span>
          <textarea
            value={conditionDescription}
            onChange={(e) => setConditionDescription(e.target.value)}
            rows={3}
            required
            placeholder="What was reported to Serve — facts as disclosed, not a clinical assessment."
            className={fieldClassName}
          />
        </label>

        <label className="mt-4 block">
          <span className={labelClassName}>Treatment (as disclosed by the client, optional)</span>
          <textarea
            value={treatmentDescription}
            onChange={(e) => setTreatmentDescription(e.target.value)}
            rows={2}
            placeholder="e.g. Client reports antibiotics prescribed by their physician."
            className={fieldClassName}
          />
        </label>

        <label className="mt-4 block">
          <span className={labelClassName}>Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldClassName} />
        </label>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Record Infection"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/qapi/infections")}
          disabled={isPending}
          className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
