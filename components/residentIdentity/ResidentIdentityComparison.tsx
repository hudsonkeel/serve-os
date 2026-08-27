"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  dismissIdentityCandidate,
  mergeResidents,
  resolveIdentityCandidateInvestigate,
  resolveIdentityCandidateNotDuplicate,
  resolveIdentityCandidateProfileCorrected,
} from "@/lib/actions/residentIdentity";
import type { ResidentComparisonRecord } from "@/lib/data/residentIdentity";
import { recommendCanonicalResident } from "@/lib/residents/identity/canonicalRecommendation";
import { Badge } from "@/components/ui/Badge";
import { RELATIONSHIP_LABELS, RELATIONSHIP_TONES } from "@/components/residents/ResidentIdentityAndRelationship";
import type { ResidentServeRelationshipDetail } from "@/lib/data/residentServeRelationships";

interface EvidenceEntry {
  signalType: string;
  residentIdA: string;
  residentIdB: string;
  description: string;
  strength: "strong" | "contextual" | "negative";
}

// Household context has no `strength` — it is never scored, only shown as
// corroborating context alongside the identity evidence above.
interface HouseholdContextEntry {
  signalType: string;
  residentIdA: string;
  residentIdB: string;
  description: string;
}

interface CandidateRecord {
  id: string;
  status: string;
  confidence_band: "high" | "probable" | "needs_investigation";
  evidence: EvidenceEntry[];
  household_context: HouseholdContextEntry[];
  resolution_rationale: string | null;
}

interface ResidentIdentityComparisonProps {
  candidate: CandidateRecord;
  residents: ResidentComparisonRecord[];
  linkedCounts: Record<string, Record<string, number>>;
  relationshipDetails: Record<string, ResidentServeRelationshipDetail | null>;
  documentEvidenceCounts: Record<string, { documents: number; evidence: number }>;
}

const FIELD_LABEL = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";
const FIELD_INPUT =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60";

function totalLinkedRecords(counts: Record<string, number> | undefined): number {
  return Object.values(counts ?? {}).reduce((sum, n) => sum + n, 0);
}

function fullName(r: ResidentComparisonRecord): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.displayName || "Unnamed Resident";
}

const COMPARE_FIELDS: { key: keyof ResidentComparisonRecord; label: string }[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "middleName", label: "Middle Name" },
  { key: "preferredName", label: "Preferred Name" },
  { key: "unitNumber", label: "Apartment" },
  { key: "building", label: "Building" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "sourceSystem", label: "Source System" },
  { key: "sourceFile", label: "Source File" },
  { key: "createdAt", label: "Created" },
];

const isOpen = (status: string) => status === "open" || status === "investigating";

export function ResidentIdentityComparison({
  candidate,
  residents,
  linkedCounts,
  relationshipDetails,
  documentEvidenceCounts,
}: ResidentIdentityComparisonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<"none" | "not_duplicate" | "profile_corrected" | "investigate" | "dismiss">("none");
  const [note, setNote] = useState("");

  const [a, b] = residents;
  const recommendation = useMemo(() => {
    if (!a || !b) return null;
    return recommendCanonicalResident(
      { id: a.id, firstName: a.firstName, lastName: a.lastName, unitNumber: a.unitNumber, needsReview: a.needsReview, sourceSystem: a.sourceSystem, linkedRecordCount: totalLinkedRecords(linkedCounts[a.id]) },
      { id: b.id, firstName: b.firstName, lastName: b.lastName, unitNumber: b.unitNumber, needsReview: b.needsReview, sourceSystem: b.sourceSystem, linkedRecordCount: totalLinkedRecords(linkedCounts[b.id]) },
    );
  }, [a, b, linkedCounts]);
  const recommendedCanonicalId = recommendation?.canonicalResidentId ?? a?.id ?? b?.id ?? null;

  const [canonicalId, setCanonicalId] = useState<string | null>(recommendedCanonicalId);

  if (!a || !b) {
    return <p className="font-sans text-body text-muted">This candidate no longer has two comparable resident records.</p>;
  }

  const duplicateId = canonicalId === a.id ? b.id : a.id;

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setActiveForm("none");
      setNote("");
      router.refresh();
    });
  }

  const resolved = !isOpen(candidate.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={candidate.confidence_band === "high" ? "danger" : candidate.confidence_band === "probable" ? "warning" : "neutral"}>
          {candidate.confidence_band === "high" ? "High Confidence" : candidate.confidence_band === "probable" ? "Probable" : "Needs Investigation"}
        </Badge>
        <Badge tone="neutral">{candidate.status}</Badge>
      </div>

      {/* Identity evidence — the ONLY evidence the confidence band above was computed from */}
      <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
        <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">Why this may be the same person</h3>
        <ul className="space-y-1.5">
          {candidate.evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2 font-sans text-sm text-body">
              <Badge tone={e.strength === "strong" ? "success" : e.strength === "negative" ? "danger" : "neutral"}>
                {e.strength === "strong" ? "Strong" : e.strength === "negative" ? "Conflict" : "Context"}
              </Badge>
              <span>{e.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Household context — corroborating only, never counted toward confidence */}
      {candidate.household_context.length > 0 && (
        <div className="rounded-lg border border-ivory-border bg-surface px-5 py-4">
          <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">Household context</h3>
          <p className="mb-2 font-sans text-xs text-subtle">
            Corroborating only — apartment, phone, and contact overlap never independently raise identity confidence. See the household
            relationship inference (Community Intelligence) for what this may mean if these are two different people, e.g. spouses sharing a home.
          </p>
          <ul className="space-y-1.5">
            {candidate.household_context.map((h, i) => (
              <li key={i} className="flex items-start gap-2 font-sans text-sm text-body">
                <Badge tone="neutral">Household</Badge>
                <span>{h.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Current Serve relationship + AxisCare identity link + documents/
          evidence, per side — required context for choosing a canonical
          survivor that the field-by-field table below doesn't cover on
          its own (an inactive/archived record naturally has no live
          relationship computed for it — shown honestly, not guessed). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[a, b].map((r) => {
          const detail = relationshipDetails[r.id];
          const counts = documentEvidenceCounts[r.id];
          return (
            <div key={r.id} className="rounded-lg border border-ivory-border bg-surface px-4 py-3">
              <p className="font-sans text-sm font-semibold text-body">{fullName(r)}</p>
              <p className="mt-0.5 font-sans text-xs text-subtle">{r.isActive ? "Active resident record" : "Inactive / archived record"}</p>
              <div className="mt-2 space-y-1 font-sans text-sm text-body">
                <p>
                  <span className="text-subtle">Relationship: </span>
                  {detail ? (
                    <Badge tone={RELATIONSHIP_TONES[detail.projection.relationship]}>{RELATIONSHIP_LABELS[detail.projection.relationship]}</Badge>
                  ) : (
                    <span className="text-muted">No live relationship computed (record is inactive)</span>
                  )}
                </p>
                <p>
                  <span className="text-subtle">AxisCare: </span>
                  {detail?.axiscareMatch ? (
                    <span>
                      #{detail.axiscareMatch.axiscareId} ({detail.axiscareMatch.identityStatus.replace(/_/g, " ")})
                    </span>
                  ) : (
                    <span className="text-muted">No match</span>
                  )}
                </p>
                <p className="text-subtle">
                  {counts ? `${counts.documents} document(s) · ${counts.evidence} evidence record(s)` : "—"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Side-by-side comparison */}
      <div className="overflow-x-auto rounded-lg border border-ivory-border bg-surface">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-ivory-border">
              <th className="px-4 py-2 text-left text-subtle">Field</th>
              <th className="px-4 py-2 text-left text-body">
                {fullName(a)} {a.id === recommendedCanonicalId && <span className="font-normal text-subtle">(recommended canonical)</span>}
              </th>
              <th className="px-4 py-2 text-left text-body">
                {fullName(b)} {b.id === recommendedCanonicalId && <span className="font-normal text-subtle">(recommended canonical)</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_FIELDS.map((f) => {
              const valA = String(a[f.key] ?? "—");
              const valB = String(b[f.key] ?? "—");
              const differs = valA !== valB;
              return (
                <tr key={f.key} className="border-b border-ivory-border last:border-0">
                  <td className="px-4 py-2 text-subtle">{f.label}</td>
                  <td className={`px-4 py-2 ${differs ? "font-semibold text-body" : "text-muted"}`}>{valA}</td>
                  <td className={`px-4 py-2 ${differs ? "font-semibold text-body" : "text-muted"}`}>{valB}</td>
                </tr>
              );
            })}
            <tr className="border-t border-ivory-border">
              <td className="px-4 py-2 text-subtle">Linked records (total)</td>
              <td className="px-4 py-2 text-body">{totalLinkedRecords(linkedCounts[a.id])}</td>
              <td className="px-4 py-2 text-body">{totalLinkedRecords(linkedCounts[b.id])}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>
      )}

      {resolved ? (
        <p className="font-sans text-sm text-subtle">
          This candidate is resolved ({candidate.status}). {candidate.resolution_rationale}
        </p>
      ) : (
        <div className="space-y-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
          <div>
            <span className={FIELD_LABEL}>Canonical resident (kept active)</span>
            <div className="mt-1 flex gap-4">
              {[a, b].map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 font-sans text-sm text-body">
                  <input type="radio" checked={canonicalId === r.id} onChange={() => setCanonicalId(r.id)} />
                  {fullName(r)}
                </label>
              ))}
            </div>
            {recommendation && (
              <div className="mt-2 rounded-md border border-ivory-border bg-surface px-3 py-2">
                <p className="font-sans text-xs font-semibold uppercase tracking-widest text-subtle">
                  Recommended: {fullName(recommendation.canonicalResidentId === a.id ? a : b)}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {recommendation.reasons.map((reason, i) => (
                    <li key={i} className="font-sans text-xs text-body">
                      ✓ {reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 font-sans text-xs text-subtle">History from the alternate record will be preserved.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={isPending || !canonicalId}
              onClick={() =>
                runAction(() =>
                  mergeResidents({
                    candidateId: candidate.id,
                    canonicalResidentId: canonicalId as string,
                    duplicateResidentId: duplicateId,
                    deferConsolidation: false,
                  }),
                )
              }
            >
              Same Person — Consolidate Records
            </Button>
            <Button
              type="button"
              disabled={isPending || !canonicalId}
              onClick={() =>
                runAction(() =>
                  mergeResidents({
                    candidateId: candidate.id,
                    canonicalResidentId: canonicalId as string,
                    duplicateResidentId: duplicateId,
                    deferConsolidation: true,
                  }),
                )
              }
            >
              Same Person — Keep Separate for Now
            </Button>
          </div>
          <p className="font-sans text-xs text-subtle">
            Both options immediately retire the non-canonical record (it stops appearing as an ordinary active resident, and its
            name becomes a known alias of the canonical record) — that part is not optional once you&apos;ve confirmed same person.
            &quot;Consolidate Records&quot; also reassigns that record&apos;s notes, history, and other linked data to the canonical
            record right now. &quot;Keep Separate for Now&quot; defers only that reassignment — finish it later from this same page.
          </p>

          <div className="flex flex-wrap gap-3 border-t border-ivory-border pt-3">
            <Button type="button" size="small" onClick={() => setActiveForm("not_duplicate")}>
              Not the Same Person
            </Button>
            <Button type="button" size="small" onClick={() => setActiveForm("profile_corrected")}>
              Correct a Profile Field
            </Button>
            <Button type="button" size="small" onClick={() => setActiveForm("investigate")}>
              Investigate Later
            </Button>
            <Button type="button" size="small" onClick={() => setActiveForm("dismiss")}>
              Incorrect Candidate
            </Button>
          </div>

          {activeForm !== "none" && (
            <div className="space-y-2 rounded-md border border-ivory-border bg-surface p-3">
              <label className="block">
                <span className={FIELD_LABEL}>
                  {activeForm === "not_duplicate" && "Why are these different people?"}
                  {activeForm === "profile_corrected" && "What was corrected, and on which record?"}
                  {activeForm === "investigate" && "Note for later review (optional)"}
                  {activeForm === "dismiss" && "Why is this candidate incorrect?"}
                </span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={FIELD_INPUT} />
              </label>
              {activeForm === "profile_corrected" && (
                <p className="font-sans text-xs text-subtle">
                  Edit the field directly on the{" "}
                  <Link href={`/residents/${a.id}`} className="underline">
                    {fullName(a)}
                  </Link>{" "}
                  or{" "}
                  <Link href={`/residents/${b.id}`} className="underline">
                    {fullName(b)}
                  </Link>{" "}
                  profile page, then close this candidate below.
                </p>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (activeForm === "not_duplicate") runAction(() => resolveIdentityCandidateNotDuplicate({ candidateId: candidate.id, reason: note }));
                  if (activeForm === "profile_corrected") runAction(() => resolveIdentityCandidateProfileCorrected({ candidateId: candidate.id, note }));
                  if (activeForm === "investigate") runAction(() => resolveIdentityCandidateInvestigate({ candidateId: candidate.id, note }));
                  if (activeForm === "dismiss") runAction(() => dismissIdentityCandidate({ candidateId: candidate.id, reason: note }));
                }}
                className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
