import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const base =
  "w-full rounded-lg border bg-white px-4 py-3 font-sans text-sm text-navy outline-none transition-colors placeholder:text-subtle";
const normal = "border-ivory-border focus:border-gold/50";
const err = "border-red-300 focus:border-red-400";

interface WrapperProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, error, children }: WrapperProps) {
  return (
    <div className="space-y-1.5">
      <label className="block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </label>
      {children}
      {error && <p className="font-sans text-xs text-red-500">{error}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean };
export function FormInput({ hasError, ...props }: InputProps) {
  return <input className={`${base} ${hasError ? err : normal}`} {...props} />;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  hasError?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
};
export function FormSelect({ hasError, options, placeholder, ...props }: SelectProps) {
  return (
    <select className={`${base} ${hasError ? err : normal} cursor-pointer`} {...props}>
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean };
export function FormTextarea({ hasError, ...props }: TextareaProps) {
  return (
    <textarea
      rows={4}
      className={`${base} ${hasError ? err : normal} resize-none`}
      {...props}
    />
  );
}
