import { RequirementResolutionCard } from "@/components/workforce/RequirementResolutionCard";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/workforce/categorySummary";
import type { RequirementEvaluation, RequirementSetEvaluation } from "@/lib/compliance/requirementSetStatus";
import type { PersonEvidence } from "@/lib/supabase/types";
import type { WorkforceLifecycleStatus } from "@/lib/workforce/lifecycleStatus";

function groupByCategory(requirements: RequirementEvaluation[]): Array<{ category: string; items: RequirementEvaluation[] }> {
  const groups = new Map<string, RequirementEvaluation[]>();
  for (const evaluation of requirements) {
    const category = evaluation.requirement.category;
    const existing = groups.get(category);
    if (existing) existing.push(evaluation);
    else groups.set(category, [evaluation]);
  }

  const ordered = CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  const remaining = [...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  return [...ordered, ...remaining];
}

// The Employee Record Audit's operational center, Level 2/3: one compact,
// expandable row per requirement (RequirementResolutionCard), grouped into
// the product's four operational categories — nothing pre-expanded, so an
// employee who's fine to work shows a quiet page of collapsed rows rather
// than eleven always-open evidence cards.
export function EmployeeRecordAuditSection({
  registry,
  workforceMemberId,
  canManage,
  rosterOptions,
  lifecycleStatus,
  history,
}: {
  registry: RequirementSetEvaluation;
  workforceMemberId: string;
  canManage: boolean;
  rosterOptions: Array<{ workforceMemberId: string; displayName: string }>;
  lifecycleStatus: WorkforceLifecycleStatus;
  history: PersonEvidence[];
}) {
  const groups = groupByCategory(registry.requirements);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.category}>
          <h4 className="mb-3 font-sans text-xs font-semibold uppercase tracking-widest text-subtle">
            {CATEGORY_LABELS[group.category] ?? group.category}
          </h4>
          <div className="space-y-2">
            {group.items.map((evaluation) => (
              <RequirementResolutionCard
                key={evaluation.requirement.id}
                evaluation={evaluation}
                workforceMemberId={workforceMemberId}
                canManage={canManage}
                rosterOptions={rosterOptions}
                lifecycleStatus={lifecycleStatus}
                history={history.filter(
                  (e) => e.requirement_id === evaluation.requirement.id && e.id !== evaluation.latestEvidence?.id
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
