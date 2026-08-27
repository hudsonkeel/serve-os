"use client";

// Add New Client phase — the compact creation form + duplicate-review +
// confirmation + success flow (sections 3, 28, 29). Deliberately not a
// full assessment/onboarding wizard (section 32) — just enough to
// establish the canonical person and their Serve relationship; Client
// Readiness and Continue to Assessment drive everything else.
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  checkForPossibleExistingServePerson,
  createNewClient,
  establishRelationshipForExistingPerson,
  type CreateNewClientInput,
} from "@/lib/actions/addClient";
import type { PossibleExistingServePersonMatch } from "@/lib/data/addClientDuplicateCheck";
import { AssessmentCaptureButton } from "@/components/residents/AssessmentCaptureButton";
import { CARE_MODEL_LABELS } from "@/lib/communities/careModel";
import type { Community } from "@/lib/supabase/types";

interface AddClientFormProps {
  communities: Community[];
  defaultCommunityId: string | null;
}

type Mode = "form" | "possible_match" | "confirming" | "success" | "existing_person_success";

type RelationshipStatus = "active_client" | "prospect";

export function AddClientForm({ communities, defaultCommunityId }: AddClientFormProps) {
  const [mode, setMode] = useState<Mode>("form");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [possibleMatch, setPossibleMatch] = useState<PossibleExistingServePersonMatch | null>(null);
  const [createdResidentId, setCreatedResidentId] = useState<string | null>(null);
  const [existingPersonName, setExistingPersonName] = useState<string | null>(null);

  const [communityId, setCommunityId] = useState(defaultCommunityId ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [building, setBuilding] = useState("");
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>("active_client");

  const selectedCommunity = communities.find((c) => c.id === communityId) ?? null;
  const isTraditionalCare = selectedCommunity?.care_model === "traditional_care";

  function buildInput(acknowledgedPossibleMatchResidentId?: string): CreateNewClientInput {
    return {
      communityId,
      firstName,
      lastName,
      phone: phone || undefined,
      email: email || undefined,
      dateOfBirth: dateOfBirth || undefined,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      zipCode: zipCode || undefined,
      unitNumber: unitNumber || undefined,
      building: building || undefined,
      relationshipStatus,
      acknowledgedPossibleMatchResidentId,
    };
  }

  function handleContinue() {
    setError(null);
    if (!communityId) {
      setError("Select a community.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    startTransition(async () => {
      const result = await checkForPossibleExistingServePerson({
        communityId,
        firstName,
        lastName,
        phone: phone || undefined,
        email: email || undefined,
        dateOfBirth: dateOfBirth || undefined,
        unitNumber: unitNumber || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.match) {
        setPossibleMatch(result.match);
        setMode("possible_match");
        return;
      }
      setMode("confirming");
    });
  }

  function handleCreate(acknowledgedPossibleMatchResidentId?: string) {
    setError(null);
    startTransition(async () => {
      const result = await createNewClient(buildInput(acknowledgedPossibleMatchResidentId));
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.possibleMatch) {
        // Fresh server-side re-check found a (possibly new) candidate —
        // never trust the client's earlier "no match" state.
        setPossibleMatch(result.possibleMatch);
        setMode("possible_match");
        return;
      }
      if (result.residentId) {
        setCreatedResidentId(result.residentId);
        setMode("success");
      }
    });
  }

  function handleUseExistingPerson() {
    if (!possibleMatch) return;
    setError(null);
    startTransition(async () => {
      const result = await establishRelationshipForExistingPerson({
        residentId: possibleMatch.residentId,
        relationshipStatus,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setExistingPersonName(possibleMatch.residentName);
      setCreatedResidentId(possibleMatch.residentId);
      setMode("existing_person_success");
    });
  }

  if (mode === "success" || mode === "existing_person_success") {
    return (
      <div className="max-w-xl rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
        <p className="font-sans text-sm font-semibold uppercase tracking-wide text-success-text">
          {mode === "success" ? "Client Created" : "Relationship Established"}
        </p>
        <p className="mt-2 font-sans text-lg text-body">
          {mode === "success" ? `${firstName} ${lastName}` : existingPersonName}
        </p>
        <p className="mt-1 font-sans text-sm text-muted">
          {selectedCommunity?.name} · {relationshipStatus === "active_client" ? "Active Client" : "Prospect"}
        </p>
        {mode === "success" && (
          <p className="mt-3 font-sans text-xs text-muted">
            Client Readiness will pick this client up automatically — no separate enrollment step.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/residents/${createdResidentId}`}
            className="inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light"
          >
            View Client
          </Link>
          {createdResidentId && <AssessmentCaptureButton residentId={createdResidentId} />}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-5">
      {mode === "form" && (
        <div className="space-y-5 rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
          <div>
            <label htmlFor="add-client-community" className="block font-sans text-sm font-medium text-body">
              Community *
            </label>
            <select
              id="add-client-community"
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
            >
              <option value="">Select a community…</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({CARE_MODEL_LABELS[c.care_model]})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-client-first-name" className="block font-sans text-sm font-medium text-body">
                First name *
              </label>
              <input
                id="add-client-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              />
            </div>
            <div>
              <label htmlFor="add-client-last-name" className="block font-sans text-sm font-medium text-body">
                Last name *
              </label>
              <input
                id="add-client-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-client-dob" className="block font-sans text-sm font-medium text-body">
                Date of birth
              </label>
              <input
                id="add-client-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              />
            </div>
            <div>
              <label htmlFor="add-client-phone" className="block font-sans text-sm font-medium text-body">
                Phone
              </label>
              <input
                id="add-client-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              />
            </div>
          </div>

          <div>
            <label htmlFor="add-client-email" className="block font-sans text-sm font-medium text-body">
              Email
            </label>
            <input
              id="add-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {isTraditionalCare ? (
            <div className="space-y-3 rounded-lg border border-ivory-border bg-ivory p-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">
                Service / Home Address — Traditional Care is delivered in the client&rsquo;s own home
              </p>
              <input
                type="text"
                placeholder="Street address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                />
                <input
                  type="text"
                  placeholder="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                />
                <input
                  type="text"
                  placeholder="ZIP"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className="h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                />
              </div>
            </div>
          ) : selectedCommunity ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="add-client-unit" className="block font-sans text-sm font-medium text-body">
                  Unit / Apartment
                </label>
                <input
                  id="add-client-unit"
                  type="text"
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                />
              </div>
              <div>
                <label htmlFor="add-client-building" className="block font-sans text-sm font-medium text-body">
                  Building
                </label>
                <input
                  id="add-client-building"
                  type="text"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                />
              </div>
            </div>
          ) : null}

          <div>
            <p className="font-sans text-sm font-medium text-body">Serve Relationship</p>
            <div className="mt-1.5 flex gap-4">
              <label className="flex items-center gap-2 font-sans text-sm text-body">
                <input
                  type="radio"
                  name="relationshipStatus"
                  checked={relationshipStatus === "active_client"}
                  onChange={() => setRelationshipStatus("active_client")}
                />
                Active Client
              </label>
              <label className="flex items-center gap-2 font-sans text-sm text-body">
                <input
                  type="radio"
                  name="relationshipStatus"
                  checked={relationshipStatus === "prospect"}
                  onChange={() => setRelationshipStatus("prospect")}
                />
                Prospect
              </label>
            </div>
          </div>

          {error && <p className="font-sans text-sm text-danger-text">{error}</p>}

          <button
            type="button"
            disabled={isPending}
            onClick={handleContinue}
            className="h-11 w-full rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? "Checking…" : "Continue"}
          </button>
        </div>
      )}

      {mode === "possible_match" && possibleMatch && (
        <div className="space-y-4 rounded-xl border border-warning-text/40 bg-warning-surface p-6 shadow-card">
          <p className="font-sans text-xs font-semibold uppercase tracking-widest text-warning-text">
            Possible existing Serve person
          </p>
          <div>
            <p className="font-sans text-base font-semibold text-body">{possibleMatch.residentName}</p>
            {possibleMatch.isCrossCommunity && possibleMatch.candidateCommunityName && (
              <p className="font-sans text-sm text-body">Currently in {possibleMatch.candidateCommunityName}</p>
            )}
            <p className="mt-1 font-sans text-sm text-muted">{possibleMatch.reason}</p>
            {possibleMatch.isCrossCommunity && (
              <p className="mt-1 font-sans text-xs text-muted">
                This is a possible move or overlapping residency, a stale community record, or simply the same name
                — not necessarily an error. Creating this person&rsquo;s community will never change automatically.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleUseExistingPerson}
              className="h-10 rounded-lg bg-navy px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Working…" : "Use This Person"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleCreate(possibleMatch.residentId)}
              className="h-10 rounded-lg border border-ivory-border bg-surface px-4 font-sans text-sm font-semibold text-body transition-colors hover:bg-ivory disabled:opacity-50"
            >
              This Is a Different Person — Create Anyway
            </button>
            <Button
              type="button"
              onClick={() => {
                setPossibleMatch(null);
                setMode("form");
              }}
            >
              Edit Details
            </Button>
          </div>
          {error && <p className="font-sans text-sm text-danger-text">{error}</p>}
        </div>
      )}

      {mode === "confirming" && (
        <div className="space-y-4 rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
          <p className="font-sans text-xs font-semibold uppercase tracking-widest text-subtle">
            {relationshipStatus === "active_client" ? "Create Active Client" : "Create Prospect"}
          </p>
          <div>
            <p className="font-sans text-lg text-body">
              {firstName} {lastName}
            </p>
            <p className="font-sans text-sm text-muted">{selectedCommunity?.name}</p>
            {isTraditionalCare && address && (
              <p className="font-sans text-sm text-muted">
                {address}
                {city ? `, ${city}` : ""}
                {state ? `, ${state}` : ""} {zipCode}
              </p>
            )}
            {!isTraditionalCare && unitNumber && <p className="font-sans text-sm text-muted">Unit {unitNumber}</p>}
          </div>
          <p className="font-sans text-sm text-success-text">No existing Serve person confidently matched.</p>
          {error && <p className="font-sans text-sm text-danger-text">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleCreate()}
              className="h-11 rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Creating…" : relationshipStatus === "active_client" ? "Create Active Client" : "Create Prospect"}
            </button>
            <button
              type="button"
              onClick={() => setMode("form")}
              className="h-11 rounded-lg border border-ivory-border bg-surface px-5 font-sans text-sm font-semibold text-body transition-colors hover:bg-ivory"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
