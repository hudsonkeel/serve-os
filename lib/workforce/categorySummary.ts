// The four operational categories the Employee Summary (Level 2) groups
// requirements into — shared by the summary tiles and
// components/workforce/EmployeeRecordAuditSection.tsx's grouped rows, so
// the two can never disagree about what belongs where.
import type { RequirementEvaluation } from "../compliance/requirementSetStatus.ts";
import { attentionStateForRequirement, ATTENTION_STATE_RANK, type AttentionState } from "./attentionState.ts";

export const CATEGORY_LABELS: Record<string, string> = {
  employment_identity: "Employment",
  registry_eligibility: "Registry",
  training_competency: "Training",
  documentation: "Documentation",
};

export const CATEGORY_ORDER = ["employment_identity", "registry_eligibility", "training_competency", "documentation"];

export interface CategorySummary {
  category: string;
  label: string;
  worstState: AttentionState;
  needsAttentionCount: number;
  total: number;
}

// Each summary tile shows only its worst attention state and how many
// requirements need it — never a full requirement breakdown; that's
// exactly one click away.
export function summarizeByCategory(requirements: readonly RequirementEvaluation[]): CategorySummary[] {
  const groups = new Map<string, RequirementEvaluation[]>();
  for (const evaluation of requirements) {
    const category = evaluation.requirement.category;
    const existing = groups.get(category);
    if (existing) existing.push(evaluation);
    else groups.set(category, [evaluation]);
  }

  const orderedCategories = [...CATEGORY_ORDER.filter((c) => groups.has(c)), ...[...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];

  return orderedCategories.map((category) => {
    const items = groups.get(category)!;
    const states = items.map((e) => attentionStateForRequirement(e));
    const worstState = states.reduce((worst, s) => (ATTENTION_STATE_RANK[s] > ATTENTION_STATE_RANK[worst] ? s : worst), "ready" as AttentionState);
    const needsAttentionCount = states.filter((s) => s !== "ready").length;
    return { category, label: CATEGORY_LABELS[category] ?? category, worstState, needsAttentionCount, total: items.length };
  });
}
