"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { getWorkforceDocumentSignedUrl } from "@/lib/actions/workforce";

// Mirrors RegistryEvidenceCard.tsx's own viewDocument() exactly — same
// signed-URL action, same open-in-new-tab behavior — so the Audit Drill's
// evidence step is a real inspection action, not a dead-end status badge.
//
// fetchSignedUrl defaults to getWorkforceDocumentSignedUrl — unchanged
// for every existing caller (Audit Drills, Emergency Preparedness).
// Office Staff Client Readiness v0.1 fix: ClientReadinessBoard.tsx now
// passes lib/actions/residentEvidence.ts's getResidentDocumentDownloadUrl
// instead — that action verifies document.subject_type === "resident"
// and that it belongs to the requesting residentId before minting a
// signed URL; getWorkforceDocumentSignedUrl does neither and is gated by
// the Workforce permission tier, not the resident one. Client evidence
// was calling the wrong domain's action.
export function EvidenceViewButton({
  documentId,
  fetchSignedUrl = getWorkforceDocumentSignedUrl,
}: {
  documentId: string;
  fetchSignedUrl?: (documentId: string) => Promise<{ url?: string; error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function view() {
    setError(null);
    startTransition(async () => {
      const res = await fetchSignedUrl(documentId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <span className="inline-flex items-center align-middle">
      <Button type="button" size="small" onClick={view} disabled={isPending}>
        View Evidence
      </Button>
      {error && <span className="ml-2 font-sans text-xs text-red-600">{error}</span>}
    </span>
  );
}
