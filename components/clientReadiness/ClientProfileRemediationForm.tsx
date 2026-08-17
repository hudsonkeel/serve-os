"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCareContacts } from "@/lib/actions/residents";
import { recordGuardianNoneAttestationAction } from "@/lib/actions/clientReadiness";

// CR_CLIENT_PROFILE_ON_FILE's own direct-remediation action — the
// requirement's expanded card used to just say "edited elsewhere on the
// profile," forcing a scroll away from the very card that flagged the
// gap. This resolves physician/guardian right here instead, reusing the
// SAME canonical write paths the Physician/Guardian profile card already
// uses (saveCareContacts, recordGuardianNoneAttestationAction) — no
// duplicate storage, no parallel data path.
//
// saveCareContacts() replaces all four fields (physician + guardian) in
// one write, so a physician-only or guardian-only edit here must still
// submit the OTHER pair's current value unchanged, or it would silently
// null out data the user isn't touching.
interface ClientProfileRemediationFormProps {
  residentId: string;
  missingPhysician: boolean;
  guardianUnresolved: boolean;
  currentPhysicianName: string;
  currentPhysicianPhone: string;
  currentGuardianName: string;
  currentGuardianPhone: string;
}

export function ClientProfileRemediationForm({
  residentId,
  missingPhysician,
  guardianUnresolved,
  currentPhysicianName,
  currentPhysicianPhone,
  currentGuardianName,
  currentGuardianPhone,
}: ClientProfileRemediationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showPhysicianForm, setShowPhysicianForm] = useState(false);
  const [physicianName, setPhysicianName] = useState(currentPhysicianName);
  const [physicianPhone, setPhysicianPhone] = useState(currentPhysicianPhone);

  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [guardianName, setGuardianName] = useState(currentGuardianName);
  const [guardianPhone, setGuardianPhone] = useState(currentGuardianPhone);

  if (!missingPhysician && !guardianUnresolved) return null;

  function handleSavePhysician(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveCareContacts({
        residentId,
        physicianName,
        physicianPhone,
        guardianName: currentGuardianName,
        guardianPhone: currentGuardianPhone,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowPhysicianForm(false);
      router.refresh();
    });
  }

  function handleSaveGuardian(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveCareContacts({
        residentId,
        physicianName: currentPhysicianName,
        physicianPhone: currentPhysicianPhone,
        guardianName,
        guardianPhone,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowGuardianForm(false);
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

  return (
    <div className="space-y-3">
      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      {missingPhysician &&
        (!showPhysicianForm ? (
          <button
            type="button"
            onClick={() => setShowPhysicianForm(true)}
            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
          >
            Add Physician
          </button>
        ) : (
          <form onSubmit={handleSavePhysician} className="w-80 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
            <label className="block">
              <span className="font-sans text-[11px] font-medium text-muted">Physician Name</span>
              <input
                value={physicianName}
                onChange={(e) => setPhysicianName(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-sans text-[11px] font-medium text-muted">Physician Phone</span>
              <input
                value={physicianPhone}
                onChange={(e) => setPhysicianPhone(e.target.value)}
                type="tel"
                placeholder="(555) 555-5555"
                className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowPhysicianForm(false)}
                disabled={isPending}
                className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
              >
                Cancel
              </button>
            </div>
          </form>
        ))}

      {guardianUnresolved &&
        (!showGuardianForm ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowGuardianForm(true)}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
            >
              Add Guardian
            </button>
            <button
              type="button"
              onClick={handleConfirmNoGuardian}
              disabled={isPending}
              className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Confirm: No Legal Guardian"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveGuardian} className="w-80 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
            <label className="block">
              <span className="font-sans text-[11px] font-medium text-muted">Guardian Name</span>
              <input
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-sans text-[11px] font-medium text-muted">Guardian Phone</span>
              <input
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                type="tel"
                placeholder="(555) 555-5555"
                className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowGuardianForm(false)}
                disabled={isPending}
                className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
              >
                Cancel
              </button>
            </div>
          </form>
        ))}
    </div>
  );
}
