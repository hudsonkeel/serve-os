"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFamilyContact } from "@/lib/actions/residents";

function titleCase(value: string | null) {
  if (!value) return "-";
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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
  type?: "text" | "email" | "tel";
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

interface FamilyContactsCardProps {
  residentId: string;
  canEdit: boolean;
  initialContactName: string;
  initialRelationship: string;
  initialPhone: string;
  initialEmail: string;
}

export function FamilyContactsCard({
  residentId,
  canEdit,
  initialContactName,
  initialRelationship,
  initialPhone,
  initialEmail,
}: FamilyContactsCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contactName, setContactName] = useState(initialContactName);
  const [relationship, setRelationship] = useState(initialRelationship);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);

  function resetFields() {
    setContactName(initialContactName);
    setRelationship(initialRelationship);
    setPhone(initialPhone);
    setEmail(initialEmail);
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
      const result = await saveFamilyContact({
        residentId,
        contactName,
        relationship,
        phone,
        email,
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
                Contact Name
              </p>
              <p className="mt-0.5 font-sans text-sm text-body">
                {initialContactName || "-"}
              </p>
            </div>
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
                Relationship
              </p>
              <p className="mt-0.5 font-sans text-sm text-body">
                {titleCase(initialRelationship || null)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
                Phone
              </p>
              {initialPhone ? (
                <a
                  href={`tel:${initialPhone}`}
                  className="mt-0.5 block font-sans text-sm text-body underline-offset-2 hover:underline"
                >
                  {formatPhone(initialPhone)}
                </a>
              ) : (
                <p className="mt-0.5 font-sans text-sm text-subtle">-</p>
              )}
            </div>
            <div>
              <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
                Email
              </p>
              {initialEmail ? (
                <a
                  href={`mailto:${initialEmail}`}
                  className="mt-0.5 block break-all font-sans text-sm text-body underline-offset-2 hover:underline"
                >
                  {initialEmail}
                </a>
              ) : (
                <p className="mt-0.5 font-sans text-sm text-subtle">-</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-sans text-sm text-muted">Editing family contact</p>
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

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <EditableField
            label="Contact Name"
            value={contactName}
            onChange={setContactName}
            placeholder="e.g. Jane Smith"
          />
          <EditableField
            label="Relationship"
            value={relationship}
            onChange={setRelationship}
            placeholder="e.g. Daughter"
          />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <EditableField
            label="Phone"
            value={phone}
            onChange={setPhone}
            type="tel"
            placeholder="(555) 555-5555"
          />
          <EditableField
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            placeholder="name@example.com"
          />
        </div>
      </div>
    </form>
  );
}
