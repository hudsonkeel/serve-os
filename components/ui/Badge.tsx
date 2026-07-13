export type BadgeTone =
  | "neutral"
  | "gold"
  | "blue"
  | "warning"
  | "danger"
  | "success"
  | "imported";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-ivory-warm text-muted",
  gold: "bg-gold-subtle text-gold-dark",
  blue: "bg-blue-pale text-blue",
  warning: "bg-warning-surface text-warning-text",
  danger: "bg-overdue-surface text-danger-text",
  success: "bg-success-surface text-success-text",
  // Distinguishes CINCH/AxisCare-imported wellness records from Serve OS
  // entries. Shares the same amber family as "warning" rather than a
  // separate hardcoded amber, so every badge draws from one token set.
  imported: "bg-warning-surface text-warning-text",
};

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
}

/**
 * Shared status/type badge. Centralizes what used to be three near-identical
 * local `Badge` functions (Connections, Wellness Notes, Open Follow-Ups).
 * Sized at the `label` type scale (13px) rather than the old 10px arbitrary
 * value — badges frequently carry real state (priority, overdue, source),
 * not just decoration.
 */
export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-sans text-badge font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
