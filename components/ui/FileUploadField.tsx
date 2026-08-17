"use client";

import { useId, useState, type ChangeEvent } from "react";

// The one Serve OS file-picker control — everywhere a form asks a user to
// attach a file, this replaces the ambiguous browser-default "Choose File
// / No file chosen" presentation with an obvious, consistent Serve OS
// secondary action ("Choose File" / "Replace File") plus a plain-language
// selection state ("No file selected" / the chosen filename). The native
// <input type="file"> is still the real control underneath (visually
// hidden via `sr-only`, not removed) — keyboard focus, screen readers, and
// the native file picker all work exactly as they did before.
//
// Supports both ways this codebase already handles file inputs, unchanged:
//   - Uncontrolled, name-attribute forms (`<form action={fn}>` collecting
//     the file via FormData at submit — see RegistryEvidenceCard.tsx,
//     HumanAttestationDialog.tsx): pass `name`, nothing else required.
//   - Controlled forms (parent tracks the File in its own state, builds
//     FormData manually — see ResidentEvidenceSection.tsx, the Emergency
//     Preparedness forms): pass `value` + `onChange`.
// Every existing accept type, required/optional state, and upload/
// validation/submission path is untouched — this component only changes
// presentation.
export function FileUploadField({
  label,
  name,
  accept,
  required = false,
  disabled = false,
  helpText,
  buttonLabel = "Choose File",
  value,
  onChange,
  id,
}: {
  label?: string;
  name?: string;
  accept?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  buttonLabel?: string;
  value?: File | null;
  onChange?: (file: File | null) => void;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [internalFile, setInternalFile] = useState<File | null>(null);
  const isControlled = value !== undefined;
  const selectedFile = isControlled ? value : internalFile;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!isControlled) setInternalFile(file);
    onChange?.(file);
  }

  return (
    <div>
      {label && <p className="mb-1 font-sans text-[11px] font-medium text-muted">{label}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {/* The real control — visually hidden (sr-only), never removed, so
            keyboard focus/tab order, screen readers, and the native file
            picker all work exactly as a plain <input type="file"> would.
            Must precede the label in the DOM for Tailwind's `peer-*`
            sibling selector below to reach it. */}
        <input
          id={inputId}
          type="file"
          name={name}
          accept={accept}
          required={required}
          disabled={disabled}
          onChange={handleChange}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className={`inline-flex shrink-0 items-center rounded-lg border border-navy/30 px-3 py-1.5 font-sans text-xs font-medium text-navy hover:bg-ivory-warm peer-focus-visible:ring-2 peer-focus-visible:ring-navy peer-focus-visible:ring-offset-2 ${
            disabled ? "pointer-events-none opacity-50" : "cursor-pointer"
          }`}
        >
          {selectedFile ? "Replace File" : buttonLabel}
        </label>
        <span className="min-w-0 truncate font-sans text-xs text-muted">
          {selectedFile ? selectedFile.name : "No file selected"}
        </span>
      </div>
      {helpText && <p className="mt-1 font-sans text-[11px] text-subtle">{helpText}</p>}
    </div>
  );
}
