"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { getWorkforceDocumentSignedUrl } from "@/lib/actions/workforce";

// Mirrors RegistryEvidenceCard.tsx's own viewDocument() exactly — same
// signed-URL action, same open-in-new-tab behavior — so the Audit Drill's
// evidence step is a real inspection action, not a dead-end status badge.
export function EvidenceViewButton({ documentId }: { documentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function view() {
    setError(null);
    startTransition(async () => {
      const res = await getWorkforceDocumentSignedUrl(documentId);
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
