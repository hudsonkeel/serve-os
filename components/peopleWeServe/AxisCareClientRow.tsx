import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { AxisCareClientOperationalRow } from "@/lib/data/axiscareClientOperationalSummary";
import type {
  AxisCareClientOperationalBucket,
  AxisCareIdentityStatus,
} from "@/lib/integrations/axiscare/clientOperationalStatus";

const BUCKET_LABELS: Record<AxisCareClientOperationalBucket, string> = {
  active_client: "Active Client",
  inactive_client: "Inactive Client",
  prospect: "Prospect",
  needs_review: "Needs Review",
  excluded: "Excluded",
};

const BUCKET_TONES: Record<AxisCareClientOperationalBucket, BadgeTone> = {
  active_client: "success",
  inactive_client: "neutral",
  prospect: "gold",
  needs_review: "warning",
  excluded: "neutral",
};

const IDENTITY_LABELS: Record<AxisCareIdentityStatus, string> = {
  confirmed: "Identity Confirmed",
  candidate: "Identity Candidate",
  needs_identity_review: "Needs Identity Review",
  unmatched: "Unmatched",
};

const IDENTITY_TONES: Record<AxisCareIdentityStatus, BadgeTone> = {
  confirmed: "success",
  candidate: "blue",
  needs_identity_review: "warning",
  unmatched: "neutral",
};

const MATCH_BASIS_LABELS: Record<string, string> = {
  email: "email match",
  phone: "phone match",
  name_and_apartment: "name + apartment match",
  name_and_community: "name + community match",
  none: "no match basis",
};

function titleCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface AxisCareClientRowProps {
  row: AxisCareClientOperationalRow;
}

export function AxisCareClientRow({ row }: AxisCareClientRowProps) {
  const { residentMatch } = row;

  return (
    <div className="px-6 py-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={BUCKET_TONES[row.operationalBucket]}>{BUCKET_LABELS[row.operationalBucket]}</Badge>
        <Badge tone={IDENTITY_TONES[row.identityStatus]}>{IDENTITY_LABELS[row.identityStatus]}</Badge>
        <span className="font-sans text-sm text-muted">AxisCare #{row.axiscareId}</span>
      </div>

      <p className="font-sans text-card-title font-semibold text-body">{row.name || "(no name on file)"}</p>

      <p className="mt-1 font-sans text-sm text-muted">
        {row.statusLabel ?? (row.statusActive ? "Active" : "Inactive")}
        {row.classes.length > 0 && ` · ${row.classes.join(", ")}`}
      </p>

      {residentMatch.residentId ? (
        <p className="mt-2 font-sans text-sm text-body">
          Serve match:{" "}
          <Link href={`/residents/${residentMatch.residentId}`} className="font-medium text-navy hover:text-navy-light">
            {residentMatch.residentName ?? "View resident"}
          </Link>
          <span className="text-muted"> · {MATCH_BASIS_LABELS[residentMatch.basis] ?? residentMatch.basis}</span>
        </p>
      ) : (
        <p className="mt-2 font-sans text-sm text-muted">No Serve resident match found.</p>
      )}

      {row.disposition && (
        <div className="mt-3 rounded-lg border border-ivory-border bg-ivory px-4 py-3">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Disposition: {titleCase(row.disposition)}
          </p>
          {row.dispositionRationale && (
            <p className="mt-1 font-sans text-sm text-muted">{row.dispositionRationale}</p>
          )}
          {(row.dispositionSetBy || row.dispositionSetAt) && (
            <p className="mt-1 font-sans text-xs text-subtle">
              {row.dispositionSetBy && `by ${row.dispositionSetBy}`}
              {row.dispositionSetBy && row.dispositionSetAt && " · "}
              {row.dispositionSetAt && new Date(row.dispositionSetAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
