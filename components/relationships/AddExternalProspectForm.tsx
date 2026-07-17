"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRelationship } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
  RESIDENCE_TYPE_LABELS,
  RESIDENCE_TYPES,
} from "@/lib/relationships/constants";
import { PipelineStage, RelationshipActionType, RelationshipPriority, ResidenceType } from "@/lib/supabase/types";

interface AddExternalProspectFormProps {
  onDone: () => void;
}

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

// An External Prospect is a prospective client who may receive Serve
// services outside a supported community — defined by an *expected
// service location*, not by the absence of a linked resident. See
// docs/design/RELATIONSHIPS.md, "External Prospect domain model." The
// prospective client and the primary contact may be the same person or
// different people — this form makes that distinction explicit rather
// than collapsing both into one free-text name.
export function AddExternalProspectForm({ onDone }: AddExternalProspectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 1. Prospective client identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // Relationship display name — auto-suggested from the prospective
  // client's last name, but always overridable.
  const [displayName, setDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const suggestedDisplayName = lastName.trim() ? `${lastName.trim()} Family Inquiry` : "";

  // 2. Primary contact
  const [contactIsClient, setContactIsClient] = useState(true);
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactRelationship, setPrimaryContactRelationship] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");

  // 3. Expected service location
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [locationNotes, setLocationNotes] = useState("");

  // 4. Residence context
  const [residenceType, setResidenceType] = useState<ResidenceType | "">("");
  const [facilityName, setFacilityName] = useState("");

  // 5. Opportunity information
  const [sourceLabel, setSourceLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [stage, setStage] = useState<PipelineStage>("new_inquiry");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [priority, setPriority] = useState<RelationshipPriority>("normal");
  const [firstActionTitle, setFirstActionTitle] = useState("");
  const [firstActionType, setFirstActionType] = useState<RelationshipActionType>("call");
  const [firstActionDueAt, setFirstActionDueAt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createRelationship({
        relationshipType: "external_prospect",
        stage,
        displayName: (displayNameTouched ? displayName : suggestedDisplayName) || "External Prospect",
        prospectiveClientFirstName: firstName,
        prospectiveClientLastName: lastName,
        prospectiveClientPreferredName: preferredName,
        prospectiveClientPhone: clientPhone,
        prospectiveClientEmail: clientEmail,
        primaryContactIsProspectiveClient: contactIsClient,
        primaryContactName: contactIsClient ? undefined : primaryContactName,
        primaryContactRelationship: contactIsClient ? undefined : primaryContactRelationship,
        primaryContactPhone: contactIsClient ? undefined : primaryContactPhone,
        primaryContactEmail: contactIsClient ? undefined : primaryContactEmail,
        serviceAddressLine1: addressLine1,
        serviceAddressLine2: addressLine2,
        serviceCity: city,
        serviceState: state,
        servicePostalCode: postalCode,
        locationNotes,
        residenceType: residenceType || undefined,
        facilityName,
        sourceType: "manual",
        sourceLabel,
        summary,
        ownerLabel,
        priority,
        firstActionTitle,
        firstActionType,
        firstActionDueAt,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onDone();
      if (result.id) {
        router.push(`/relationships/${result.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-ivory-border bg-ivory p-6"
    >
      <div>
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Add External Prospect
        </p>
        <p className="-mt-1 font-sans text-sm text-subtle">
          A prospective client who may receive Serve services outside a supported community.
        </p>
      </div>

      {/* 1. Prospective client identity */}
      <div className="space-y-3 rounded-lg border border-ivory-border bg-surface px-4 py-4">
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Prospective Client
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>First Name</span>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Margaret"
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Last Name</span>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Preferred Name (optional)</span>
            <input
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Relationship Name</span>
            <input
              type="text"
              value={displayNameTouched ? displayName : suggestedDisplayName}
              onChange={(e) => {
                setDisplayNameTouched(true);
                setDisplayName(e.target.value);
              }}
              placeholder="Smith Family Inquiry"
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Prospective Client Phone (optional)</span>
            <input
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Prospective Client Email (optional)</span>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className={fieldClassName}
            />
          </label>
        </div>
      </div>

      {/* 2. Primary contact */}
      <div className="space-y-3 rounded-lg border border-ivory-border bg-surface px-4 py-4">
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Primary Contact
        </p>
        <label className="flex items-center gap-2 font-sans text-sm text-body">
          <input
            type="checkbox"
            checked={contactIsClient}
            onChange={(e) => setContactIsClient(e.target.checked)}
            className="h-4 w-4 rounded border-ivory-border"
          />
          The prospective client is their own primary contact
        </label>

        {contactIsClient ? (
          <p className="rounded-md bg-ivory-warm px-3 py-2 font-sans text-sm text-muted">
            Using {[firstName, lastName].filter(Boolean).join(" ") || "the prospective client"}&apos;s own phone
            and email above as the primary contact.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Contact Name</span>
              <input
                type="text"
                value={primaryContactName}
                onChange={(e) => setPrimaryContactName(e.target.value)}
                placeholder="Jennifer Smith"
                className={fieldClassName}
              />
            </label>
            <label className="block">
              <span className={labelClassName}>Relationship to Prospective Client</span>
              <input
                type="text"
                value={primaryContactRelationship}
                onChange={(e) => setPrimaryContactRelationship(e.target.value)}
                placeholder="Daughter"
                className={fieldClassName}
              />
            </label>
            <label className="block">
              <span className={labelClassName}>Contact Phone</span>
              <input
                type="tel"
                value={primaryContactPhone}
                onChange={(e) => setPrimaryContactPhone(e.target.value)}
                className={fieldClassName}
              />
            </label>
            <label className="block">
              <span className={labelClassName}>Contact Email</span>
              <input
                type="email"
                value={primaryContactEmail}
                onChange={(e) => setPrimaryContactEmail(e.target.value)}
                className={fieldClassName}
              />
            </label>
          </div>
        )}
      </div>

      {/* 3. Expected service location */}
      <div className="space-y-3 rounded-lg border border-ivory-border bg-surface px-4 py-4">
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Expected Service Location
        </p>
        <p className="-mt-2 font-sans text-sm text-subtle">
          Where Serve expects to deliver service — required to create an External Prospect.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelClassName}>Address Line 1</span>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="123 Oak Lane"
              className={fieldClassName}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClassName}>Address Line 2 (optional)</span>
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>City</span>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={fieldClassName} />
          </label>
          <label className="block">
            <span className={labelClassName}>State</span>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="TX"
              maxLength={2}
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>ZIP Code</span>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="75034"
              className={fieldClassName}
            />
          </label>
        </div>
        <label className="block">
          <span className={labelClassName}>Service-Location Notes (optional)</span>
          <input
            type="text"
            value={locationNotes}
            onChange={(e) => setLocationNotes(e.target.value)}
            placeholder="Gate code required; rear apartment"
            className={fieldClassName}
          />
        </label>
      </div>

      {/* 4. Residence context */}
      <div className="space-y-3 rounded-lg border border-ivory-border bg-surface px-4 py-4">
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Residence Context (optional)
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Residence Type</span>
            <select
              value={residenceType}
              onChange={(e) => setResidenceType(e.target.value as ResidenceType | "")}
              className={fieldClassName}
            >
              <option value="">Not specified</option>
              {RESIDENCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {RESIDENCE_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClassName}>Community / Facility Name</span>
            <input
              type="text"
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              placeholder="Contextual only — not the postal address"
              className={fieldClassName}
            />
          </label>
        </div>
      </div>

      {/* 5. Opportunity information */}
      <div className="space-y-3 rounded-lg border border-ivory-border bg-surface px-4 py-4">
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Opportunity
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Source</span>
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="Website inquiry, referral, phone call..."
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Initial Stage</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as PipelineStage)} className={fieldClassName}>
              {RELATIONSHIP_STAGES.map((value) => (
                <option key={value} value={value}>
                  {RELATIONSHIP_STAGE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClassName}>Owner</span>
            <input
              type="text"
              value={ownerLabel}
              onChange={(e) => setOwnerLabel(e.target.value)}
              placeholder="e.g. Brian"
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as RelationshipPriority)}
              className={fieldClassName}
            >
              {RELATIONSHIP_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {RELATIONSHIP_PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={labelClassName}>Summary (optional)</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className={fieldClassName}
          />
        </label>

        <div className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
          <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Next Action
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className={labelClassName}>What&apos;s next</span>
              <input
                type="text"
                value={firstActionTitle}
                onChange={(e) => setFirstActionTitle(e.target.value)}
                placeholder="Call Jennifer"
                className={fieldClassName}
              />
            </label>
            <label className="block">
              <span className={labelClassName}>Type</span>
              <select
                value={firstActionType}
                onChange={(e) => setFirstActionType(e.target.value as RelationshipActionType)}
                className={fieldClassName}
              >
                {RELATIONSHIP_ACTION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_ACTION_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClassName}>Due</span>
              <input
                type="date"
                value={firstActionDueAt}
                onChange={(e) => setFirstActionDueAt(e.target.value)}
                className={fieldClassName}
              />
            </label>
          </div>
          <p className="mt-2 font-sans text-sm text-subtle">
            Leave blank if there&apos;s nothing due yet — the relationship will show as &quot;No Next Action&quot;.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save Relationship"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={isPending}
          className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
