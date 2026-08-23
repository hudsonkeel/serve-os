import { ResidentConnections } from "@/lib/data/connections";

// One-line "About This Person" summary for the collapsed state (see
// CollapsibleSection usage in app/residents/[id]/page.tsx) — computed from
// the same data GettingToKnow renders in full, so it can never drift out
// of sync with what's actually recorded. A plain (non-"use client") module
// so server components can call it directly.
export function summarizeGettingToKnow({ profile, interests, milestones }: ResidentConnections): string {
  const parts: string[] = [];
  if (profile?.preferred_name) parts.push(`Goes by "${profile.preferred_name}"`);
  if (interests.length > 0) parts.push(`${interests.length} thing${interests.length === 1 ? "" : "s"} learned`);
  if (milestones.length > 0) parts.push(`${milestones.length} important date${milestones.length === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing recorded yet.";
}
