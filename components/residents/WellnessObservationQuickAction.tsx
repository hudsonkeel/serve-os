"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { CommunityResidentRecord } from "@/lib/data/communityMetrics";
import { AddWellnessNoteForm } from "./AddWellnessNoteForm";

function matchesSearch(record: CommunityResidentRecord, query: string): boolean {
  const resident = record.resident;
  const haystack = [
    resident.first_name,
    resident.last_name,
    resident.preferred_name,
    resident.display_name,
    resident.full_name,
    resident.unit_number,
    record.preferredNickname,
  ];

  return haystack.some((field) => field && field.toLowerCase().includes(query));
}

interface WellnessObservationQuickActionProps {
  records: CommunityResidentRecord[];
}

export function WellnessObservationQuickAction({
  records,
}: WellnessObservationQuickActionProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const trimmedQuery = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmedQuery) return [];
    return records.filter((record) => matchesSearch(record, trimmedQuery)).slice(0, 20);
  }, [records, trimmedQuery]);

  const selected = selectedId
    ? (records.find((record) => record.id === selectedId) ?? null)
    : null;

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
              Recording for
            </p>
            <p className="font-serif text-xl text-body">
              {selected.residentDisplayName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setJustSaved(false);
            }}
            className="shrink-0 font-sans text-sm text-muted transition-colors hover:text-body"
          >
            Choose a different resident
          </button>
        </div>

        {justSaved && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="font-sans text-sm text-emerald-700">
              Wellness observation saved for {selected.residentDisplayName}.
            </p>
            <Link
              href={`/residents/${selected.id}`}
              className="mt-1 inline-block font-sans text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
            >
              View resident record
            </Link>
          </div>
        )}

        <AddWellnessNoteForm
          residentId={selected.id}
          defaultOpen
          onSaved={() => setJustSaved(true)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by resident name or apartment..."
          autoFocus
          className="h-12 w-full rounded-lg border border-ivory-border bg-surface pl-11 pr-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
        />
      </div>

      {trimmedQuery && matches.length === 0 && (
        <p className="font-sans text-sm text-muted">No residents match your search.</p>
      )}

      {matches.length > 0 && (
        <div className="divide-y divide-ivory-border rounded-lg border border-ivory-border bg-surface">
          {matches.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => setSelectedId(record.id)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-ivory"
            >
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-medium text-body">
                  {record.residentDisplayName}
                </p>
                <p className="font-sans text-sm text-muted">
                  {[
                    record.unitNumber ? `Unit ${record.unitNumber}` : null,
                    record.building,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No unit on file"}
                </p>
              </div>
              <span className="shrink-0 font-sans text-sm text-gold">Select →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
