import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { buildReconciliationAnchorHref } from "@/lib/reconciliation/anchor";
import type { UnresolvedExternalPersonItem } from "@/lib/data/axiscareOperationalState";
import type { ServeClientLifecycle } from "@/lib/integrations/axiscare/clientLifecycle";

// A person Serve knows about through an external source (AxisCare today)
// but has not yet resolved to a canonical resident — deliberately styled
// distinctly from ResidentRelationshipRow, never merged into the same
// list, so it never reads as a resident row (AxisCare Reconciliation +
// Multi-Source Identity Ingestion phase, section 4/7).
const LIFECYCLE_LABELS: Record<ServeClientLifecycle, string> = {
  active_client: "Active Client",
  inactive_client: "Inactive Client",
  prospect: "Prospect",
  needs_review: "Needs Review",
};

const LIFECYCLE_TONES: Record<ServeClientLifecycle, BadgeTone> = {
  active_client: "success",
  inactive_client: "neutral",
  prospect: "gold",
  needs_review: "warning",
};

const SOURCE_LABELS: Record<UnresolvedExternalPersonItem["source"], string> = {
  axiscare: "AxisCare",
};

interface UnresolvedExternalPersonCardProps {
  item: UnresolvedExternalPersonItem;
  showCommunity?: boolean;
}

export function UnresolvedExternalPersonCard({ item, showCommunity = false }: UnresolvedExternalPersonCardProps) {
  const href = buildReconciliationAnchorHref(item.source, item.sourceRecordId);

  return (
    <div className="relative flex items-start gap-4 px-4 py-4 transition-colors hover:bg-ivory md:px-6 md:py-6">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={LIFECYCLE_TONES[item.lifecycle]}>{LIFECYCLE_LABELS[item.lifecycle]}</Badge>
          <Badge tone="neutral">Unmatched</Badge>
          <span className="font-sans text-sm text-muted">{SOURCE_LABELS[item.source]}</span>
        </div>

        <p className="font-sans text-card-title font-semibold text-body">{item.vendorDisplayName}</p>
        {showCommunity && <p className="mt-0.5 font-sans text-sm text-muted">{item.communityName}</p>}
        <p className="mt-2 font-sans text-sm text-muted">No Serve resident match found.</p>
      </div>

      <Link
        href={href}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-navy/20 px-3 py-2 font-sans text-sm font-medium text-navy transition-colors hover:bg-navy/5"
      >
        Review &amp; Resolve
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </div>
  );
}
