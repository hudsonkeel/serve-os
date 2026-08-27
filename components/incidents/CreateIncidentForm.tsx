"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createIncidentAction } from "@/lib/actions/incidents";
import { searchResidentsForLinking } from "@/lib/actions/relationships";
import { INCIDENT_TYPE_LABELS, INCIDENT_TYPE_OPTIONS } from "./incidentLabels";
import type { ResidentSearchResult } from "@/lib/data/relationships";
import type { IncidentType } from "@/lib/supabase/types";

export interface WorkforceOption {
  id: string;
  displayName: string;
}

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

function nowForDateTimeInput(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function CreateIncidentForm({ workforceOptions }: { workforceOptions: WorkforceOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Client linkage — reuses the same search-then-select pattern as
  // AddResidentProspectForm (searchResidentsForLinking), never a new
  // resident search implementation. Optional here — an incident may
  // involve no client at all.
  const [residentQuery, setResidentQuery] = useState("");
  const [residentResults, setResidentResults] = useState<ResidentSearchResult[]>([]);
  const [isSearchingResidents, setIsSearchingResidents] = useState(false);
  const [selectedResident, setSelectedResident] = useState<ResidentSearchResult | null>(null);

  const [workforceMemberId, setWorkforceMemberId] = useState("");

  const [occurredAt, setOccurredAt] = useState(nowForDateTimeInput());
  const [location, setLocation] = useState("");
  const [incidentType, setIncidentType] = useState<IncidentType | "">("");
  const [incidentTypeOther, setIncidentTypeOther] = useState("");
  const [description, setDescription] = useState("");
  const [immediateResponse, setImmediateResponse] = useState("");
  const [injuryOccurred, setInjuryOccurred] = useState(false);
  const [injuryMedicalDetails, setInjuryMedicalDetails] = useState("");

  const [partyDraft, setPartyDraft] = useState("");
  const [partiesNotified, setPartiesNotified] = useState<string[]>([]);

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

  function addParty() {
    const value = partyDraft.trim();
    if (!value) return;
    if (!partiesNotified.includes(value)) {
      setPartiesNotified((prev) => [...prev, value]);
    }
    setPartyDraft("");
  }

  function removeParty(value: string) {
    setPartiesNotified((prev) => prev.filter((p) => p !== value));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!occurredAt) {
      setError("Date/time occurred is required.");
      return;
    }
    if (!incidentType) {
      setError("Incident type is required.");
      return;
    }
    if (incidentType === "other" && !incidentTypeOther.trim()) {
      setError("Please describe the incident type since “Other” was selected.");
      return;
    }
    if (!description.trim()) {
      setError("A factual description of what happened is required.");
      return;
    }

    startTransition(async () => {
      const res = await createIncidentAction({
        residentId: selectedResident?.id ?? null,
        workforceMemberId: workforceMemberId || null,
        occurredAt,
        location: location.trim() || null,
        incidentType,
        incidentTypeOther: incidentType === "other" ? incidentTypeOther.trim() : null,
        description: description.trim(),
        immediateResponse: immediateResponse.trim() || null,
        injuryOccurred,
        injuryMedicalDetails: injuryOccurred ? injuryMedicalDetails.trim() || null : null,
        partiesNotified,
        followUpRequired: false,
        owner: null,
        notes: notes.trim() || null,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.incident) {
        router.push(`/qapi/incidents/${res.incident.id}`);
      } else {
        router.push("/qapi/incidents");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Who Was Involved</h2>
        <p className="mt-1 font-sans text-xs text-muted">Both are optional — link whoever is applicable.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className={labelClassName}>Client (optional)</span>
            {selectedResident ? (
              <p className="mt-1 font-sans text-sm text-body">
                {selectedResident.name}
                {selectedResident.unitNumber ? ` — Unit ${selectedResident.unitNumber}` : ""}{" "}
                <Button
                  type="button"
                  size="small"
                  onClick={() => {
                    setSelectedResident(null);
                    setResidentQuery("");
                    setResidentResults([]);
                  }}
                >
                  Change
                </Button>
              </p>
            ) : (
              <div>
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
          </div>

          <label className="block">
            <span className={labelClassName}>Staff / Caregiver (optional)</span>
            <select
              value={workforceMemberId}
              onChange={(e) => setWorkforceMemberId(e.target.value)}
              className={fieldClassName}
            >
              <option value="">None</option>
              {workforceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">What Happened</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Date/Time Occurred</span>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
              className={fieldClassName}
            />
          </label>

          <label className="block">
            <span className={labelClassName}>Location (optional)</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Hallway near unit 4B"
              className={fieldClassName}
            />
          </label>

          <label className="block">
            <span className={labelClassName}>Incident Type</span>
            <select
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value as IncidentType)}
              required
              className={fieldClassName}
            >
              <option value="" disabled>
                Select...
              </option>
              {INCIDENT_TYPE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {INCIDENT_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          {incidentType === "other" && (
            <label className="block">
              <span className={labelClassName}>Describe the Type</span>
              <input
                type="text"
                value={incidentTypeOther}
                onChange={(e) => setIncidentTypeOther(e.target.value)}
                className={fieldClassName}
              />
            </label>
          )}
        </div>

        <label className="mt-4 block">
          <span className={labelClassName}>Factual Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            required
            placeholder="What happened, as observed or reported — facts only."
            className={fieldClassName}
          />
        </label>
      </section>

      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Immediate Response</h2>

        <label className="mt-4 block">
          <span className={labelClassName}>Response / Actions Taken (optional)</span>
          <textarea
            value={immediateResponse}
            onChange={(e) => setImmediateResponse(e.target.value)}
            rows={2}
            className={fieldClassName}
          />
        </label>

        <div className="mt-4">
          <label className="flex items-center gap-2 font-sans text-sm text-body">
            <input type="checkbox" checked={injuryOccurred} onChange={(e) => setInjuryOccurred(e.target.checked)} />
            Injury or medical involvement occurred
          </label>
          {injuryOccurred && (
            <textarea
              value={injuryMedicalDetails}
              onChange={(e) => setInjuryMedicalDetails(e.target.value)}
              rows={2}
              placeholder="Injury/medical details..."
              className={`${fieldClassName} mt-2`}
            />
          )}
        </div>

        <div className="mt-4">
          <span className={labelClassName}>Parties Notified (optional)</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={partyDraft}
              onChange={(e) => setPartyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addParty();
                }
              }}
              placeholder="e.g. Family, Supervisor, EMS"
              className={fieldClassName}
            />
            <Button type="button" size="small" className="shrink-0" onClick={addParty}>
              Add
            </Button>
          </div>
          {partiesNotified.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {partiesNotified.map((party) => (
                <span
                  key={party}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ivory-warm px-3 py-1 font-sans text-xs text-body"
                >
                  {party}
                  <button
                    type="button"
                    onClick={() => removeParty(party)}
                    aria-label={`Remove ${party}`}
                    className="text-subtle hover:text-body"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <label className="mt-4 block">
          <span className={labelClassName}>Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldClassName} />
        </label>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving..." : "Record Incident"}
        </Button>
        <Button type="button" size="small" onClick={() => router.push("/qapi/incidents")} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
