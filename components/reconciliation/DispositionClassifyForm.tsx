"use client";

import { useState, useTransition } from "react";
import { classifyAxisCareClientRecord } from "@/lib/actions/reconciliation";
import { AXISCARE_CLIENT_DISPOSITIONS, type AxisCareClientDisposition } from "@/lib/integrations/axiscare/clientDisposition";

const DISPOSITION_LABELS: Record<AxisCareClientDisposition, string> = {
  real_client: "Real Client",
  prospect: "Prospect",
  non_client_related_person: "Related Person (Not a Client)",
  administrative_record: "Administrative Record",
  test_placeholder: "Test / Placeholder",
  needs_review: "Needs Review",
};

interface DispositionClassifyFormProps {
  axiscareId: string;
  currentDisposition: AxisCareClientDisposition | null;
}

export function DispositionClassifyForm({ axiscareId, currentDisposition }: DispositionClassifyFormProps) {
  const [open, setOpen] = useState(false);
  const [disposition, setDisposition] = useState<AxisCareClientDisposition>(currentDisposition ?? "needs_review");
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function handleSubmit() {
    if (!rationale.trim()) {
      setMessage({ type: "error", text: "A rationale is required." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await classifyAxisCareClientRecord({ axiscareId, disposition, rationale: rationale.trim() });
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Classification saved." });
        setOpen(false);
        setRationale("");
      }
    });
  }

  return (
    <div className="mt-3 border-t border-ivory-border pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:bg-ivory"
        >
          {currentDisposition ? "Reclassify this record" : "Classify this record"}
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block font-sans text-sm font-medium text-body">Disposition</label>
          <select
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as AxisCareClientDisposition)}
            className="w-full max-w-xs rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          >
            {AXISCARE_CLIENT_DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {DISPOSITION_LABELS[d]}
              </option>
            ))}
          </select>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            placeholder="Rationale (required)"
            className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              Save Classification
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`mt-2 font-sans text-sm ${message.type === "error" ? "text-danger-text" : "text-success-text"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
