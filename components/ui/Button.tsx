import Link from "next/link";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, SECONDARY_BUTTON_SMALL_CLASS } from "./actionButtonStyles";

// Shared button/action-control primitives (2026-08-25 UX affordance pass).
// Deliberately built ON TOP OF components/ui/actionButtonStyles.ts —
// discovered mid-pass already establishing this exact primary/secondary
// hierarchy (with min-h-[44px] touch targets and shadow-card) for the
// resident-profile action strip, so this file does not introduce a second,
// competing button language. Button/LinkButton exist to give every OTHER
// part of the app (which doesn't already import actionButtonStyles.ts
// directly) an ergonomic component API for the same, single set of
// classes — not a new visual style.
//
// Two components, one shared className builder: Button renders a real
// <button> (onClick/type=submit actions — Save, Resolve, Complete), and
// LinkButton renders a Next.js <Link> styled identically (navigation —
// Review in Audit Readiness, View Requirement, Manage). Both exist so a
// navigation control and an action control can look pixel-identical
// without either one lying about what it actually does in the DOM.
//
// Existing direct consumers of the raw PRIMARY_BUTTON_CLASS/
// SECONDARY_BUTTON_CLASS/SECONDARY_BUTTON_SMALL_CLASS constants (the
// resident action strip) are left untouched — already correct, no reason
// to churn working code onto the component wrapper.

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "default" | "small";

// actionButtonStyles.ts defines no distinct "primary small" — every
// primary action in this app is page/section-level, never a compact
// row-level control, so primary always uses the one PRIMARY_BUTTON_CLASS
// regardless of the requested size.
function variantClass(variant: ButtonVariant, size: ButtonSize): string {
  if (variant === "primary") return PRIMARY_BUTTON_CLASS;
  return size === "small" ? SECONDARY_BUTTON_SMALL_CLASS : SECONDARY_BUTTON_CLASS;
}

export function buttonClassName(variant: ButtonVariant = "secondary", size: ButtonSize = "default", className = ""): string {
  return [variantClass(variant, size), className].filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A real <button> styled as a primary or secondary action control. Forwards its ref (e.g. for focus restoration after a cancelled edit). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "default", className, ...props },
  ref
) {
  return <button ref={ref} className={buttonClassName(variant, size, className)} {...props} />;
});

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A Next.js <Link> styled identically to Button — for navigation that should look unmistakably clickable. */
export function LinkButton({ href, variant = "secondary", size = "default", className, ...props }: LinkButtonProps) {
  return <Link href={href} className={buttonClassName(variant, size, className)} {...props} />;
}
