"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProspectStatus } from "@/lib/supabase/types";
import { updateProspectStatus } from "@/lib/actions/prospects";

interface Action {
  label: string;
  nextStatus: ProspectStatus | null;
}

const ACTIONS: Action[] = [
  { label: "Review", nextStatus: "reviewing" },
  { label: "Log Contact", nextStatus: "contacted" },
  { label: "Schedule Assessment", nextStatus: "assessment_scheduled" },
  { label: "Create Proposal", nextStatus: null },
  { label: "Convert to Client", nextStatus: "converted" },
  { label: "Close", nextStatus: "closed" },
];

interface WorkflowActionsProps {
  id: string;
  currentStatus: ProspectStatus;
  variant?: "menu" | "buttons";
}

export function WorkflowActions({
  id,
  currentStatus,
  variant = "menu",
}: WorkflowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [isOpen]);

  function handleAction(nextStatus: ProspectStatus) {
    setIsOpen(false);
    startTransition(async () => {
      await updateProspectStatus(id, nextStatus);
      router.refresh();
    });
  }

  function isDisabled(action: Action) {
    return isPending || action.nextStatus === null || action.nextStatus === currentStatus;
  }

  function actionLabel(action: Action) {
    if (action.nextStatus === null) return `${action.label} (coming soon)`;
    return action.label;
  }

  if (variant === "buttons") {
    return (
      <div className="flex flex-col gap-1.5">
        {ACTIONS.map((action) => {
          const disabled = isDisabled(action);
          return (
            <button
              key={action.label}
              type="button"
              disabled={disabled}
              onClick={() => action.nextStatus && handleAction(action.nextStatus)}
              className={`rounded-md px-3 py-2 text-left font-sans text-sm transition-colors ${
                disabled
                  ? "cursor-not-allowed text-subtle"
                  : "text-body hover:bg-ivory-warm hover:text-navy"
              } ${action.nextStatus === currentStatus ? "font-medium text-muted" : ""}`}
            >
              {actionLabel(action)}
            </button>
          );
        })}
      </div>
    );
  }

  // variant="menu" — compact dropdown for the inbox row
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-ivory-border px-2.5 py-1.5 font-sans text-xs text-muted transition-colors hover:border-navy/20 hover:text-body disabled:opacity-50"
      >
        {isPending ? "…" : "Actions ▾"}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-ivory-border bg-white shadow-card-hover">
          {ACTIONS.map((action) => {
            const disabled = isDisabled(action);
            return (
              <button
                key={action.label}
                type="button"
                disabled={disabled}
                onClick={() =>
                  action.nextStatus && handleAction(action.nextStatus)
                }
                className={`w-full px-4 py-2.5 text-left font-sans text-sm transition-colors ${
                  disabled
                    ? "cursor-not-allowed text-subtle"
                    : "text-body hover:bg-ivory hover:text-navy"
                } ${action.nextStatus === currentStatus ? "font-medium text-muted" : ""}`}
              >
                {actionLabel(action)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
