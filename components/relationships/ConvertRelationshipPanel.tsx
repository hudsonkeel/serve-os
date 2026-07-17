"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertResidentProspectToActiveClient } from "@/lib/actions/relationships";
import {
  checkResidentForActiveProspect,
  convertExternalProspectToActiveClient,
  convertExternalProspectToExistingResident,
  convertExternalProspectToNewResident,
} from "@/lib/actions/externalClients";
import { searchResidentsForLinking } from "@/lib/actions/relationships";
import {
  OPEN_ACTION_DISPOSITION_LABELS,
  OPEN_ACTION_DISPOSITIONS,
  OpenActionDisposition,
} from "@/lib/externalClients/constants";
import {
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_ACTION_TYPES,
} from "@/lib/relationships/constants";
import type { ResidentSearchResult } from "@/lib/data/relationships";
import type { Relationship, RelationshipActionType } from "@/lib/supabase/types";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

function OpenActionDispositionField({
  value,
  onChange,
}: {
  value: OpenActionDisposition;
  onChange: (value: OpenActionDisposition) => void;
}) {
  return (
    <label className="block">
      <span className={labelClassName}>Open Sales Actions</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as OpenActionDisposition)}
        className={fieldClassName}
      >
        {OPEN_ACTION_DISPOSITIONS.map((d) => (
          <option key={d} value={d}>
            {OPEN_ACTION_DISPOSITION_LABELS[d]}
          </option>
        ))}
      </select>
    </label>
  );
}

function OnboardingActionFields({
  title,
  setTitle,
  type,
  setType,
  dueAt,
  setDueAt,
}: {
  title: string;
  setTitle: (v: string) => void;
  type: RelationshipActionType;
  setType: (v: RelationshipActionType) => void;
  dueAt: string;
  setDueAt: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-ivory-border bg-surface px-4 py-3">
      <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
        Onboarding Action (optional)
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className={labelClassName}>What&apos;s next</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Schedule welcome visit"
            className={fieldClassName}
          />
        </label>
        <label className="block">
          <span className={labelClassName}>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as RelationshipActionType)} className={fieldClassName}>
            {RELATIONSHIP_ACTION_TYPES.map((v) => (
              <option key={v} value={v}>
                {RELATIONSHIP_ACTION_TYPE_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClassName}>Due</span>
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={fieldClassName} />
        </label>
      </div>
    </div>
  );
}

function ResidentProspectConversionForm({ relationship, onDone }: { relationship: Relationship; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [effectiveStartDate, setEffectiveStartDate] = useState("");
  const [conversionNote, setConversionNote] = useState("");
  const [disposition, setDisposition] = useState<OpenActionDisposition>("keep_open");
  const [actionTitle, setActionTitle] = useState("");
  const [actionType, setActionType] = useState<RelationshipActionType>("follow_up");
  const [actionDueAt, setActionDueAt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await convertResidentProspectToActiveClient({
        relationshipId: relationship.id,
        effectiveStartDate,
        conversionNote,
        openActionDisposition: disposition,
        onboardingActionTitle: actionTitle,
        onboardingActionType: actionType,
        onboardingActionDueAt: actionDueAt,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-ivory-border bg-ivory p-6">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Convert to Active Client
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Effective Start Date</span>
          <input type="date" value={effectiveStartDate} onChange={(e) => setEffectiveStartDate(e.target.value)} className={fieldClassName} />
        </label>
        <OpenActionDispositionField value={disposition} onChange={setDisposition} />
      </div>
      <label className="block">
        <span className={labelClassName}>Conversion Note (optional)</span>
        <textarea value={conversionNote} onChange={(e) => setConversionNote(e.target.value)} rows={2} className={fieldClassName} />
      </label>
      <OnboardingActionFields
        title={actionTitle}
        setTitle={setActionTitle}
        type={actionType}
        setType={setActionType}
        dueAt={actionDueAt}
        setDueAt={setActionDueAt}
      />
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Converting..." : "Confirm Conversion"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ActivateExternalClientForm({ relationship, onDone }: { relationship: Relationship; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [serviceStartDate, setServiceStartDate] = useState("");
  const [conversionNote, setConversionNote] = useState("");
  const [disposition, setDisposition] = useState<OpenActionDisposition>("keep_open");
  const [actionTitle, setActionTitle] = useState("");
  const [actionType, setActionType] = useState<RelationshipActionType>("follow_up");
  const [actionDueAt, setActionDueAt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await convertExternalProspectToActiveClient({
        relationshipId: relationship.id,
        firstName,
        lastName,
        phone,
        email,
        serviceAddressLine1: addressLine1,
        serviceAddressLine2: addressLine2,
        city,
        state,
        postalCode,
        primaryContactName: relationship.primary_contact_name ?? undefined,
        primaryContactRelationship: relationship.primary_contact_relationship ?? undefined,
        primaryContactPhone: relationship.primary_contact_phone ?? undefined,
        primaryContactEmail: relationship.primary_contact_email ?? undefined,
        serviceStartDate,
        conversionNote,
        openActionDisposition: disposition,
        onboardingActionTitle: actionTitle,
        onboardingActionType: actionType,
        onboardingActionDueAt: actionDueAt,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-ivory-border bg-ivory p-6">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Activate as External Client
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>First Name</span>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Last Name</span>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Phone</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClassName} />
        </label>
      </div>

      <div className="rounded-lg border border-ivory-border bg-surface px-4 py-3">
        <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">Service Address</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelClassName}>Street</span>
            <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className={fieldClassName} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClassName}>Apt / Unit (optional)</span>
            <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} className={fieldClassName} />
          </label>
          <label className="block">
            <span className={labelClassName}>City</span>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={fieldClassName} />
          </label>
          <label className="block">
            <span className={labelClassName}>State</span>
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} className={fieldClassName} />
          </label>
          <label className="block">
            <span className={labelClassName}>Postal Code</span>
            <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={fieldClassName} />
          </label>
          <label className="block">
            <span className={labelClassName}>Service Start Date</span>
            <input type="date" value={serviceStartDate} onChange={(e) => setServiceStartDate(e.target.value)} className={fieldClassName} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <OpenActionDispositionField value={disposition} onChange={setDisposition} />
        <label className="block">
          <span className={labelClassName}>Conversion Note (optional)</span>
          <input type="text" value={conversionNote} onChange={(e) => setConversionNote(e.target.value)} className={fieldClassName} />
        </label>
      </div>

      <OnboardingActionFields
        title={actionTitle}
        setTitle={setActionTitle}
        type={actionType}
        setType={setActionType}
        dueAt={actionDueAt}
        setDueAt={setActionDueAt}
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Activating..." : "Confirm Activation"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed">
          Cancel
        </button>
      </div>
    </form>
  );
}

function NewResidentProspectForm({ relationship, onDone }: { relationship: Relationship; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState(relationship.prospective_resident_name ?? "");
  const [communityName, setCommunityName] = useState(relationship.community_name ?? "");
  const [unitNumber, setUnitNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [conversionNote, setConversionNote] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await convertExternalProspectToNewResident({
        relationshipId: relationship.id,
        firstName,
        lastName,
        communityName,
        unitNumber,
        phone,
        email,
        familyContactName: relationship.primary_contact_name ?? undefined,
        familyContactRelationship: relationship.primary_contact_relationship ?? undefined,
        familyContactPhone: relationship.primary_contact_phone ?? undefined,
        familyContactEmail: relationship.primary_contact_email ?? undefined,
        conversionNote,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-ivory-border bg-ivory p-6">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Create New Resident Prospect
      </p>
      <p className="-mt-2 font-sans text-sm text-subtle">
        Use when this person is moving into a supported community. Family contact details are carried over
        from this Relationship&apos;s primary contact.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>First Name</span>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Last Name</span>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Community</span>
          <input type="text" value={communityName} onChange={(e) => setCommunityName(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Unit / Apartment (optional)</span>
          <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Phone</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClassName} />
        </label>
        <label className="block">
          <span className={labelClassName}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClassName} />
        </label>
      </div>
      <label className="block">
        <span className={labelClassName}>Conversion Note (optional)</span>
        <input type="text" value={conversionNote} onChange={(e) => setConversionNote(e.target.value)} className={fieldClassName} />
      </label>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Creating..." : "Create Resident & Convert"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ExistingResidentProspectForm({ relationship, onDone }: { relationship: Relationship; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [selected, setSelected] = useState<ResidentSearchResult | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [conversionNote, setConversionNote] = useState("");

  async function handleSearch(value: string) {
    setQuery(value);
    setSelected(null);
    setDuplicateWarning(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setResults(await searchResidentsForLinking(value));
  }

  async function handleSelect(resident: ResidentSearchResult) {
    setSelected(resident);
    setResults([]);
    setError(null);
    const check = await checkResidentForActiveProspect(resident.id);
    if (check.existing) {
      setDuplicateWarning(
        `${resident.name} already has an active Resident Prospect Relationship ("${check.existing.display_name}"). Linking here isn't possible while that exists.`
      );
    } else {
      setDuplicateWarning(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || duplicateWarning) return;
    setError(null);
    startTransition(async () => {
      const result = await convertExternalProspectToExistingResident({
        relationshipId: relationship.id,
        residentId: selected.id,
        conversionNote,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-ivory-border bg-ivory p-6">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Link to Existing Resident Prospect
      </p>
      <label className="block max-w-sm">
        <span className={labelClassName}>Search Residents</span>
        <input
          type="text"
          value={selected ? selected.name : query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by resident name or apartment..."
          className={fieldClassName}
        />
      </label>
      {results.length > 0 && (
        <ul className="max-w-sm space-y-1 rounded-md border border-ivory-border bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => handleSelect(r)}
                className="w-full px-3 py-2 text-left font-sans text-sm text-body hover:bg-ivory-warm"
              >
                {r.name}
                {r.unitNumber ? ` — Unit ${r.unitNumber}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {duplicateWarning && (
        <p className="rounded-lg border border-amber-200 bg-warning-surface px-3 py-2 font-sans text-sm text-body">
          {duplicateWarning}
        </p>
      )}
      <label className="block">
        <span className={labelClassName}>Conversion Note (optional)</span>
        <input type="text" value={conversionNote} onChange={(e) => setConversionNote(e.target.value)} className={fieldClassName} />
      </label>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !selected || !!duplicateWarning}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Linking..." : "Link & Convert"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed">
          Cancel
        </button>
      </div>
    </form>
  );
}

type ExternalChoice = "activate" | "new_resident" | "existing_resident" | null;

export function ConvertRelationshipPanel({ relationship }: { relationship: Relationship }) {
  const [isResidentConverting, setIsResidentConverting] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const [externalChoice, setExternalChoice] = useState<ExternalChoice>(null);

  if (relationship.status === "closed") return null;

  if (relationship.relationship_type === "resident_prospect") {
    if (isResidentConverting) {
      return <ResidentProspectConversionForm relationship={relationship} onDone={() => setIsResidentConverting(false)} />;
    }
    return (
      <button
        type="button"
        onClick={() => setIsResidentConverting(true)}
        className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90"
      >
        Convert to Active Client
      </button>
    );
  }

  if (relationship.relationship_type === "external_prospect") {
    if (externalChoice === "activate") {
      return <ActivateExternalClientForm relationship={relationship} onDone={() => setExternalChoice(null)} />;
    }
    if (externalChoice === "new_resident") {
      return <NewResidentProspectForm relationship={relationship} onDone={() => setExternalChoice(null)} />;
    }
    if (externalChoice === "existing_resident") {
      return <ExistingResidentProspectForm relationship={relationship} onDone={() => setExternalChoice(null)} />;
    }

    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setIsChoosing((open) => !open)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90"
        >
          {isChoosing ? "Close" : "Convert"}
        </button>
        {isChoosing && (
          <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-lg border border-ivory-border bg-surface py-1 shadow-card">
            <button
              type="button"
              onClick={() => {
                setIsChoosing(false);
                setExternalChoice("activate");
              }}
              className="block w-full px-4 py-2.5 text-left font-sans text-sm font-medium text-body hover:bg-ivory-warm"
            >
              Activate as External Client
              <span className="block font-sans text-xs text-subtle">Serve will provide traditional home-care service here</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsChoosing(false);
                setExternalChoice("new_resident");
              }}
              className="block w-full px-4 py-2.5 text-left font-sans text-sm font-medium text-body hover:bg-ivory-warm"
            >
              Create New Resident Prospect
              <span className="block font-sans text-xs text-subtle">Moving into a supported community</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsChoosing(false);
                setExternalChoice("existing_resident");
              }}
              className="block w-full px-4 py-2.5 text-left font-sans text-sm font-medium text-body hover:bg-ivory-warm"
            >
              Link to Existing Resident Prospect
              <span className="block font-sans text-xs text-subtle">The resident record already exists</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
