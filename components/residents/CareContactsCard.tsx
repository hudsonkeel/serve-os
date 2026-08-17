"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCareContacts } from "@/lib/actions/residents";
import { recordGuardianNoneAttestationAction } from "@/lib/actions/clientReadiness";

function formatPhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length !== 10) return phone ?? "-";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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
  type?: "text" | "tel";
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-muted">{label}</span>
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

interface CareContactsCardProps {
  residentId: string;
  canEdit: boolean;
  initialPhysicianName: string;
  initialPhysicianPhone: string;
  initialGuardianName: string;
  initialGuardianPhone: string;
  // Whether a "confirmed no legal guardian" attestation already exists —
  // read from the Client Readiness evaluation, not from these fields
  // (silence is never treated as "none").
  guardianConfirmedNone: boolean;
  // Lets a compact host row (ResidentEssentials) open this straight into
  // its edit form instead of requiring a click into the read view first,
  // then a second click on this card's own internal "Edit" link.
  startInEditMode?: boolean;
}

export function CareContactsCard({
  residentId,
  canEdit,
  initialPhysicianName,
  initialPhysicianPhone,
  initialGuardianName,
  initialGuardianPhone,
  guardianConfirmedNone,
  startInEditMode = false,
}: CareContactsCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [error, setError] = useState<string | null>(null);

  const [physicianName, setPhysicianName] = useState(initialPhysicianName);
  const [physicianPhone, setPhysicianPhone] = useState(initialPhysicianPhone);
  const [guardianName, setGuardianName] = useState(initialGuardianName);
  const [guardianPhone, setGuardianPhone] = useState(initialGuardianPhone);

  function resetFields() {
    setPhysicianName(initialPhysicianName);
    setPhysicianPhone(initialPhysicianPhone);
    setGuardianName(initialGuardianName);
    setGuardianPhone(initialGuardianPhone);
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
      const result = await saveCareContacts({
        residentId,
        physicianName,
        physicianPhone,
        guardianName,
        guardianPhone,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setIsEditing(false);
      router.refresh();
    });
  }

  function handleConfirmNoGuardian() {
    setError(null);
    startTransition(async () => {
      const result = await recordGuardianNoneAttestationAction({ residentId, notes: null });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const guardianUnresolved = !initialGuardianName && !initialGuardianPhone && !guardianConfirmedNone;

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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">Physician</p>
              <p className="mt-0.5 font-sans text-sm text-body">{initialPhysicianName || "-"}</p>
            </div>
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">Physician Phone</p>
              {initialPhysicianPhone ? (
                <a href={`tel:${initialPhysicianPhone}`} className="mt-0.5 block font-sans text-sm text-body underline-offset-2 hover:underline">
                  {formatPhone(initialPhysicianPhone)}
                </a>
              ) : (
                <p className="mt-0.5 font-sans text-sm text-subtle">-</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">Legal Guardian</p>
              <p className="mt-0.5 font-sans text-sm text-body">
                {initialGuardianName || (guardianConfirmedNone ? "Confirmed — no legal guardian" : "-")}
              </p>
            </div>
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">Guardian Phone</p>
              {initialGuardianPhone ? (
                <a href={`tel:${initialGuardianPhone}`} className="mt-0.5 block font-sans text-sm text-body underline-offset-2 hover:underline">
                  {formatPhone(initialGuardianPhone)}
                </a>
              ) : (
                <p className="mt-0.5 font-sans text-sm text-subtle">-</p>
              )}
            </div>
          </div>

          {canEdit && guardianUnresolved && (
            <div className="rounded-lg border border-ivory-border bg-ivory p-3">
              <p className="font-sans text-xs text-muted">
                No legal guardian on file yet. If this client genuinely has none, confirm it explicitly rather than
                leaving it blank.
              </p>
              <button
                type="button"
                onClick={handleConfirmNoGuardian}
                disabled={isPending}
                className="mt-2 rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Confirm: No Legal Guardian"}
              </button>
            </div>
          )}

          {error && <p className="font-sans text-xs text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-sans text-sm text-muted">Editing physician / guardian contact</p>
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
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <EditableField label="Physician Name" value={physicianName} onChange={setPhysicianName} placeholder="e.g. Dr. Jane Reyes" />
          <EditableField label="Physician Phone" value={physicianPhone} onChange={setPhysicianPhone} type="tel" placeholder="(555) 555-5555" />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <EditableField label="Legal Guardian Name" value={guardianName} onChange={setGuardianName} placeholder="If applicable" />
          <EditableField label="Guardian Phone" value={guardianPhone} onChange={setGuardianPhone} type="tel" placeholder="(555) 555-5555" />
        </div>

        {/* Available here too, not only in the collapsed view — a user who
            clicks Edit specifically to resolve the guardian question
            shouldn't have to Cancel back out to find this. Same handler,
            same governed attestation; independent of Save Changes below. */}
        {guardianUnresolved && (
          <div className="rounded-lg border border-ivory-border bg-ivory p-3">
            <p className="font-sans text-xs text-muted">
              No name entered above? If this client genuinely has no legal guardian, confirm it explicitly instead of
              leaving the fields blank.
            </p>
            <button
              type="button"
              onClick={handleConfirmNoGuardian}
              disabled={isPending}
              className="mt-2 rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Confirm: No Legal Guardian"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
