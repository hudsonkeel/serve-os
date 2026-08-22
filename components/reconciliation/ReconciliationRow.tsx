import { AxisCareClientRow } from "@/components/peopleWeServe/AxisCareClientRow";
import { IdentityDecisionActions } from "./IdentityDecisionActions";
import { DispositionClassifyForm } from "./DispositionClassifyForm";
import { RestoreRecordButton } from "./RestoreRecordButton";
import { buildReconciliationAnchorId } from "@/lib/reconciliation/anchor";
import type { AxisCareClientOperationalRow } from "@/lib/data/axiscareClientOperationalSummary";

interface ReconciliationRowProps {
  row: AxisCareClientOperationalRow;
  canAct: boolean;
  showIdentityActions: boolean;
}

// Wraps the existing read-only AxisCareClientRow (reused unchanged) with
// the governed correction actions relevant to this row — identity
// decisions when a resident candidate exists, vendor disposition
// classification always. Kept as two independent action blocks,
// matching the "who is this / what kind of vendor record is this" split.
export function ReconciliationRow({ row, canAct, showIdentityActions }: ReconciliationRowProps) {
  return (
    <div
      id={buildReconciliationAnchorId("axiscare", row.axiscareId)}
      className="scroll-mt-4 target:bg-gold/5 target:ring-2 target:ring-inset target:ring-gold/40"
    >
      <AxisCareClientRow row={row} />
      {canAct && (
        <div className="-mt-3 px-6 pb-6">
          {showIdentityActions && row.residentMatch.residentId && (
            <IdentityDecisionActions
              input={{
                axiscareId: row.axiscareId,
                vendorDisplayName: row.name,
                matchBasis: row.residentMatch.basis,
                residentId: row.residentMatch.residentId,
                statusLabel: row.statusLabel,
                statusActive: row.statusActive,
                classes: [...row.classes],
              }}
            />
          )}
          {row.operationalBucket === "excluded" ? (
            <RestoreRecordButton axiscareId={row.axiscareId} />
          ) : (
            <DispositionClassifyForm axiscareId={row.axiscareId} currentDisposition={row.disposition} />
          )}
        </div>
      )}
    </div>
  );
}
