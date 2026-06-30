"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecruitingLeadStatus } from "@/lib/supabase/types";
import { updateRecruitingLeadStatus } from "@/lib/actions/recruiting";

const ACTIONS: { label: string; nextStatus: RecruitingLeadStatus }[] = [
  { label: "Mark Contacted", nextStatus: "contacted" },
  { label: "Begin Review",   nextStatus: "in_review" },
  { label: "Mark Applied",   nextStatus: "applied"   },
  { label: "Mark Hired",     nextStatus: "hired"     },
  { label: "Not a Fit",      nextStatus: "not_a_fit" },
  { label: "Archive",        nextStatus: "archived"  },
];

interface Props {
  id: string;
  currentStatus: RecruitingLeadStatus;
}

export function RecruitingWorkflowActions({ id, currentStatus }: Props) {
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

  function handleAction(nextStatus: RecruitingLeadStatus) {
    setIsOpen(false);
    startTransition(async () => {
      await updateRecruitingLeadStatus(id, nextStatus);
      router.refresh();
    });
  }

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
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-ivory-border bg-white shadow-card-hover">
          {ACTIONS.map((action) => {
            const isCurrent = action.nextStatus === currentStatus;
            return (
              <button
                key={action.label}
                type="button"
                disabled={isCurrent || isPending}
                onClick={() => handleAction(action.nextStatus)}
                className={`w-full px-4 py-2.5 text-left font-sans text-sm transition-colors ${
                  isCurrent
                    ? "cursor-default font-medium text-muted"
                    : "text-body hover:bg-ivory hover:text-navy"
                }`}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
