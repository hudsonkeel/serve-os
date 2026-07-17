"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRelationshipServiceLocation } from "@/lib/actions/relationships";
import { RESIDENCE_TYPE_LABELS, RESIDENCE_TYPES } from "@/lib/relationships/constants";
import type { RelationshipServiceLocation, ResidenceType } from "@/lib/supabase/types";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

// Editable expected service location for an External Prospect — see
// docs/design/RELATIONSHIPS.md, "External Prospect domain model." Before
// activation, this is the authoritative service address; conversion
// prepopulates from it (see ConvertRelationshipPanel's
// ActivateExternalClientForm) but this row itself stays editable
// independently until that happens.
export function RelationshipServiceLocationSection({
  relationshipId,
  location,
}: {
  relationshipId: string;
  location: RelationshipServiceLocation | null;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [addressLine1, setAddressLine1] = useState(location?.address_line_1 ?? "");
  const [addressLine2, setAddressLine2] = useState(location?.address_line_2 ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [state, setState] = useState(location?.state ?? "");
  const [postalCode, setPostalCode] = useState(location?.postal_code ?? "");
  const [residenceType, setResidenceType] = useState<ResidenceType | "">(location?.residence_type ?? "");
  const [facilityName, setFacilityName] = useState(location?.facility_name ?? "");
  const [locationNotes, setLocationNotes] = useState(location?.location_notes ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateRelationshipServiceLocation({
        relationshipId,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        residenceType: residenceType || undefined,
        facilityName,
        locationNotes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Expected Service Location
        </h3>
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            {location ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {!isEditing ? (
        location ? (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-2">
              <p className={labelClassName}>Address</p>
              <p className="mt-0.5 font-sans text-sm text-body">
                {location.address_line_1}
                {location.address_line_2 ? `, ${location.address_line_2}` : ""}
                <br />
                {location.city}, {location.state} {location.postal_code}
              </p>
            </div>
            {location.residence_type && (
              <div>
                <p className={labelClassName}>Residence Type</p>
                <p className="mt-0.5 font-sans text-sm text-body">
                  {RESIDENCE_TYPE_LABELS[location.residence_type]}
                </p>
              </div>
            )}
            {location.facility_name && (
              <div>
                <p className={labelClassName}>Community / Facility</p>
                <p className="mt-0.5 font-sans text-sm text-body">{location.facility_name}</p>
              </div>
            )}
            {location.location_notes && (
              <div className="col-span-2">
                <p className={labelClassName}>Notes</p>
                <p className="mt-0.5 font-sans text-sm text-body">{location.location_notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="font-sans text-sm text-subtle">No expected service location recorded yet.</p>
        )
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelClassName}>Address Line 1</span>
              <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className={fieldClassName} />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClassName}>Address Line 2 (optional)</span>
              <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} className={fieldClassName} />
            </label>
            <label className="block">
              <span className={labelClassName}>City</span>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={fieldClassName} />
            </label>
            <label className="block">
              <span className={labelClassName}>State</span>
              <input type="text" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} className={fieldClassName} />
            </label>
            <label className="block">
              <span className={labelClassName}>ZIP Code</span>
              <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={fieldClassName} />
            </label>
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
            <label className="block sm:col-span-2">
              <span className={labelClassName}>Community / Facility Name (optional)</span>
              <input type="text" value={facilityName} onChange={(e) => setFacilityName(e.target.value)} className={fieldClassName} />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClassName}>Service-Location Notes (optional)</span>
              <input type="text" value={locationNotes} onChange={(e) => setLocationNotes(e.target.value)} className={fieldClassName} />
            </label>
          </div>
          {error && <p className="font-sans text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
              className="font-sans text-sm text-muted hover:text-body"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
