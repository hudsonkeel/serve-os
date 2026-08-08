"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResidentProfile } from "@/lib/actions/residents";

function titleCase(value: string | null) {
  if (!value) return "-";
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDateDisplay(value: string): string {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function ReadOnlyField({
  label,
  value,
  sourceLabel,
}: {
  label: string;
  value: string;
  sourceLabel?: string;
}) {
  return (
    <div>
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
        {label}
        {sourceLabel && (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-subtle">
            · {sourceLabel}
          </span>
        )}
      </p>
      <p className="mt-0.5 font-sans text-sm text-body">{value}</p>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "date";
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
      />
    </label>
  );
}

interface ResidentProfileCardProps {
  residentId: string;
  // Server-computed (lib/auth/permissions.ts#canEditResidentProfile) —
  // admin/manager/executive only. The client never makes this decision
  // itself; it only renders what the server already decided. The server
  // action re-checks this independently regardless.
  canEdit: boolean;
  fullName: string;
  location: string;
  residentType: string | null;
  serveRelationshipLabel: string;
  serviceModel: string | null;
  residentStatus: string | null;
  needsReview: string | null;
  // Roster-derived provenance — never a live AxisCare API sync (see
  // docs/architecture/RESIDENT_STATUS_GOVERNANCE.md). Shown so staff never
  // mistake a system-of-record value for something they just edited.
  sourceSystem: string | null;
  lastSyncedAt: string | null;
  initialPreferredName: string;
  initialEmail: string;
  initialPhone: string;
  initialDateOfBirth: string | null;
  initialDateOfAdmission: string | null;
  initialPreferredLanguage: string;
  initialMobility: string;
}

function formatSyncTimestamp(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ResidentProfileCard({
  residentId,
  canEdit,
  fullName,
  location,
  residentType,
  serveRelationshipLabel,
  serviceModel,
  residentStatus,
  needsReview,
  sourceSystem,
  lastSyncedAt,
  initialPreferredName,
  initialEmail,
  initialPhone,
  initialDateOfBirth,
  initialDateOfAdmission,
  initialPreferredLanguage,
  initialMobility,
}: ResidentProfileCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialDobValue = toDateInputValue(initialDateOfBirth);
  const initialDoaValue = toDateInputValue(initialDateOfAdmission);

  const [preferredName, setPreferredName] = useState(initialPreferredName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [dateOfBirth, setDateOfBirth] = useState(initialDobValue);
  const [dateOfAdmission, setDateOfAdmission] = useState(initialDoaValue);
  const [preferredLanguage, setPreferredLanguage] = useState(initialPreferredLanguage);
  const [mobility, setMobility] = useState(initialMobility);

  function resetFields() {
    setPreferredName(initialPreferredName);
    setEmail(initialEmail);
    setPhone(initialPhone);
    setDateOfBirth(initialDobValue);
    setDateOfAdmission(initialDoaValue);
    setPreferredLanguage(initialPreferredLanguage);
    setMobility(initialMobility);
  }

  function handleEdit() {
    resetFields();
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    resetFields();
    setError(null);
    setIsEditing(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveResidentProfile({
        residentId,
        preferredName,
        email,
        phone,
        dateOfBirth,
        dateOfAdmission,
        preferredLanguage,
        mobility,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setIsEditing(false);
      router.refresh();
    });
  }

  if (!isEditing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-end">
          {canEdit && (
            <button
              type="button"
              onClick={handleEdit}
              className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
            >
              Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <ReadOnlyField label="Full Name" value={fullName} />
          <ReadOnlyField label="Preferred Name" value={initialPreferredName || "-"} />
          <ReadOnlyField label="Resident Email" value={initialEmail || "-"} />
          <ReadOnlyField label="Resident Phone" value={initialPhone || "-"} />
          <ReadOnlyField label="Location" value={location || "-"} />
          <ReadOnlyField
            label="Resident Type"
            value={titleCase(residentType)}
            sourceLabel={sourceSystem ? `from ${titleCase(sourceSystem)}` : undefined}
          />
          <ReadOnlyField
            label="Serve Relationship Status"
            value={serveRelationshipLabel}
          />
          <ReadOnlyField label="Service Model" value={titleCase(serviceModel)} />
          <ReadOnlyField
            label="Resident Status"
            value={titleCase(residentStatus)}
            sourceLabel={sourceSystem ? `from ${titleCase(sourceSystem)}` : undefined}
          />
          <ReadOnlyField
            label="Date of Birth"
            value={formatDateDisplay(initialDobValue)}
          />
          <ReadOnlyField
            label="Date of Admission"
            value={formatDateDisplay(initialDoaValue)}
          />
          <ReadOnlyField label="Mobility" value={initialMobility || "-"} />
          <ReadOnlyField
            label="Preferred Language"
            value={initialPreferredLanguage || "-"}
          />
          <ReadOnlyField label="Needs Review" value={titleCase(needsReview)} />
          <ReadOnlyField label="Last Synced" value={formatSyncTimestamp(lastSyncedAt)} />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-sans text-sm text-muted">
          Editing resident profile
        </p>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <ReadOnlyField label="Full Name" value={fullName} />
        <EditableField
          label="Preferred Name"
          value={preferredName}
          onChange={setPreferredName}
          placeholder="e.g. Mick"
        />
        <EditableField
          label="Resident Email"
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="name@example.com"
        />
        <EditableField
          label="Resident Phone"
          value={phone}
          onChange={setPhone}
          type="tel"
          placeholder="(555) 555-5555"
        />
        <ReadOnlyField label="Location" value={location || "-"} />
        <ReadOnlyField label="Resident Type" value={titleCase(residentType)} />
        <ReadOnlyField
          label="Serve Relationship Status"
          value={serveRelationshipLabel}
        />
        <ReadOnlyField label="Service Model" value={titleCase(serviceModel)} />
        <ReadOnlyField label="Resident Status" value={titleCase(residentStatus)} />
        <EditableField
          label="Date of Birth"
          value={dateOfBirth}
          onChange={setDateOfBirth}
          type="date"
        />
        <EditableField
          label="Date of Admission"
          value={dateOfAdmission}
          onChange={setDateOfAdmission}
          type="date"
        />
        <EditableField
          label="Mobility"
          value={mobility}
          onChange={setMobility}
          placeholder="e.g. Walker, Independent"
        />
        <EditableField
          label="Preferred Language"
          value={preferredLanguage}
          onChange={setPreferredLanguage}
          placeholder="e.g. English"
        />
        <ReadOnlyField label="Needs Review" value={titleCase(needsReview)} />
      </div>
    </form>
  );
}
