// The deterministic Desired State evaluation algorithm. Pure, no I/O — see
// docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md
// (Revision 2), section "State Evaluation Algorithm."
import type {
  DesiredStateDefinition,
  DesiredStateEvaluationResult,
  DesiredStateStatus,
  EvidenceRequirement,
  OperationalGap,
  RecruitingEvidenceBundle,
} from "./types.ts";

type Contribution = "satisfied" | "blocked" | "unknown" | "neutral";

interface EvidenceMatch {
  readonly found: boolean;
  readonly value: string | null;
  readonly observationId: string | null;
}

function findMatchingEvidence(requirement: EvidenceRequirement, bundle: RecruitingEvidenceBundle): EvidenceMatch {
  switch (requirement.kind) {
    case "observation": {
      const rows = bundle.observations
        .filter((o) => o.observation_key === requirement.key && o.visibility === "directly_observed")
        .sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1));
      const latest = rows[0];
      return latest
        ? { found: true, value: latest.normalized_value, observationId: latest.id }
        : { found: false, value: null, observationId: null };
    }
    case "inference": {
      const match = bundle.inferences.find((i) => i.signal_key === requirement.key);
      return match ? { found: true, value: "present", observationId: null } : { found: false, value: null, observationId: null };
    }
    case "human_confirmation": {
      const rows = bundle.humanConfirmations
        .filter((c) => c.confirmation_key === requirement.key)
        .sort((a, b) => (a.confirmed_at < b.confirmed_at ? 1 : -1));
      const latest = rows[0];
      return latest ? { found: true, value: latest.confirmed_value, observationId: null } : { found: false, value: null, observationId: null };
    }
    case "vendor_identity": {
      const match = bundle.vendorIdentities.find((v) => v.source_system === requirement.key);
      if (!match) return { found: false, value: null, observationId: null };
      return { found: true, value: match.is_human_confirmed ? "confirmed" : "unconfirmed", observationId: null };
    }
  }
}

interface RequirementClassification {
  readonly contribution: Contribution;
  readonly gap: OperationalGap | null;
  readonly supportingObservationId: string | null;
  readonly unknownNote: string | null;
}

function classifyRequirement(
  requirement: EvidenceRequirement,
  bundle: RecruitingEvidenceBundle,
  desiredStateKey: string
): RequirementClassification {
  const match = findMatchingEvidence(requirement, bundle);
  const supportingObservationId = requirement.kind === "observation" ? match.observationId : null;

  // A requirement whose mere PRESENCE is the blocking condition (e.g. an
  // exception-like inference) — this is a gate, not a real requirement to
  // satisfy, so a clean pass contributes "neutral" (never inflates
  // "in_progress"/"satisfied" math the way a genuinely satisfied
  // requirement would) — it only ever contributes "blocked" when the
  // condition it guards against is actually present.
  if (requirement.kind === "inference" && requirement.blockOnPresence) {
    if (!match.found) {
      return { contribution: "neutral", gap: null, supportingObservationId: null, unknownNote: null };
    }
    if (requirement.governance.status === "adopted" && requirement.governance.blockingEffect === "blocking") {
      // Two sources' evidence genuinely disagree — this is Conflicting
      // Evidence, not a plain Blocking Gap, even though it still blocks
      // (per this same requirement's adopted, blocking governance) until
      // a human resolves it.
      return {
        contribution: "blocked",
        gap: {
          kind: "conflicting",
          desiredStateKey,
          requirementKey: requirement.key,
          description: `An unresolved ${requirement.key} inference exists — this must be reviewed and resolved before proceeding.`,
          observedValue: "present",
          missingEvidence: ["A human review resolving the underlying inconsistency."],
        },
        supportingObservationId: null,
        unknownNote: null,
      };
    }
    return { contribution: "neutral", gap: null, supportingObservationId: null, unknownNote: null };
  }

  if (!match.found) {
    // Formalized as a typed Gap (Evidence Gap, or Human Decision Required
    // specifically when the missing evidence is a decision only a person
    // can make) — unknownNote is retained alongside it for backward
    // compatibility with existing display code that reads the bare list.
    const note = `${requirement.key}: no evidence collected yet.`;
    return {
      contribution: "unknown",
      gap: {
        kind: requirement.kind === "human_confirmation" ? "human_decision_required" : "evidence",
        desiredStateKey,
        requirementKey: requirement.key,
        description:
          requirement.kind === "human_confirmation"
            ? `A human decision is required for "${requirement.key}" — no vendor observation can resolve this.`
            : note,
        observedValue: null,
        missingEvidence: [note],
      },
      supportingObservationId: null,
      unknownNote: note,
    };
  }

  // "Any found value satisfies" is only the default when the requirement
  // has no negative-evidence concept at all (a pure corroboration, like a
  // candidate-name observation). The moment negativeEvidence is defined,
  // satisfiedByValues must be explicit — otherwise an observed negative
  // value could be silently swallowed by the "any value satisfies"
  // default before the negative-evidence check ever runs.
  const isPositive =
    requirement.satisfiedByValues === undefined
      ? requirement.negativeEvidence === undefined
      : requirement.satisfiedByValues.includes(match.value ?? "");

  if (isPositive) {
    return { contribution: "satisfied", gap: null, supportingObservationId, unknownNote: null };
  }

  if (requirement.negativeEvidence && match.value !== null && requirement.negativeEvidence.values.includes(match.value)) {
    if (requirement.negativeEvidence.evidenceClass === "source_limited") {
      return {
        contribution: "unknown",
        gap: {
          kind: "integration",
          desiredStateKey,
          requirementKey: requirement.key,
          description: requirement.negativeEvidence.scopeNote,
          observedValue: match.value,
          missingEvidence: [`Direct evidence from an authoritative source for "${requirement.scopeJustification}".`],
        },
        supportingObservationId,
        unknownNote: null,
      };
    }

    // "direct" negative evidence.
    if (requirement.governance.status === "adopted" && requirement.governance.blockingEffect === "blocking") {
      return {
        contribution: "blocked",
        gap: {
          kind: "blocking",
          desiredStateKey,
          requirementKey: requirement.key,
          description: `${requirement.key} = "${match.value}" — a governed, adopted requirement is not met.`,
          observedValue: match.value,
          missingEvidence: [`Evidence resolving "${requirement.key}" to a satisfying value.`],
        },
        supportingObservationId,
        unknownNote: null,
      };
    }

    // Direct evidence, but the requirement is not (yet) adopted — the
    // observed condition is real, but it cannot yet block anything.
    return {
      contribution: "unknown",
      gap: {
        kind: "policy_dependent_consideration",
        desiredStateKey,
        requirementKey: requirement.key,
        description: `${requirement.key} = "${match.value}". Serve has not adopted a requirement making this blocking for "${desiredStateKey}".`,
        observedValue: match.value,
        missingEvidence: [`A formal Serve decision on whether "${requirement.key}" is a required, blocking condition here.`],
      },
      supportingObservationId,
      unknownNote: null,
    };
  }

  // Evidence exists but resolves to neither a satisfying nor a recognized
  // negative value — genuinely unclear, never guessed either way.
  return {
    contribution: "unknown",
    gap: null,
    supportingObservationId,
    unknownNote: `${requirement.key}: observed value ("${match.value}") does not resolve this requirement.`,
  };
}

// "any": the objective is achieved the moment ONE path succeeds — a
// different, unrelated path being blocked never overrides a real success.
// "all": every path pertains to the same objective, so a real block always
// wins, exactly per the stated precedence (blocked > unknown > in_progress
// > satisfied).
function aggregateStatus(contributions: readonly Contribution[], combinator: "all" | "any"): DesiredStateStatus {
  const relevant = contributions.filter((c): c is Exclude<Contribution, "neutral"> => c !== "neutral");
  if (relevant.length === 0) return "unknown";

  if (combinator === "any") {
    if (relevant.includes("satisfied")) return "satisfied";
    if (relevant.includes("blocked")) return "blocked";
    return "unknown";
  }

  if (relevant.includes("blocked")) return "blocked";
  if (relevant.every((c) => c === "satisfied")) return "satisfied";
  if (relevant.includes("satisfied")) return "in_progress";
  return "unknown";
}

function buildExplanation(
  definition: DesiredStateDefinition,
  status: DesiredStateStatus,
  gaps: readonly OperationalGap[],
  unknownEvidence: readonly string[]
): string {
  // A "blocked" status can come from either a plain Blocking Gap or a
  // Conflicting Evidence gap that also happens to be adopted+blocking —
  // both must appear in the explanation.
  const blocking = gaps.filter((g) => g.kind === "blocking" || g.kind === "conflicting");
  switch (status) {
    case "satisfied":
      return `${definition.title}: satisfied.`;
    case "blocked":
      return `${definition.title}: blocked — ${blocking.map((g) => g.description).join(" ")}`;
    case "in_progress":
      return `${definition.title}: in progress — some required evidence is present, some is not yet known. ${unknownEvidence.join(" ")}`.trim();
    case "unknown":
      return unknownEvidence.length > 0
        ? `${definition.title}: unknown — ${unknownEvidence.join(" ")}`
        : `${definition.title}: unknown — insufficient evidence to determine status.`;
    case "not_applicable":
      return `${definition.title}: not applicable yet.`;
  }
}

export function evaluateDesiredState(
  definition: DesiredStateDefinition,
  bundle: RecruitingEvidenceBundle,
  priorStatuses: ReadonlyMap<string, DesiredStateStatus>
): DesiredStateEvaluationResult {
  for (const gateKey of definition.gatedBy) {
    if (priorStatuses.get(gateKey) !== "satisfied") {
      return {
        desiredStateKey: definition.key,
        desiredStateVersion: definition.version,
        status: "not_applicable",
        gaps: [],
        unknownEvidence: [],
        explanation: `${definition.title}: not applicable yet — gated by "${gateKey}", which is not yet satisfied.`,
        supportingObservationIds: [],
      };
    }
  }

  let gaps: OperationalGap[] = [];
  const unknownEvidence: string[] = [];
  const supportingObservationIds: string[] = [];
  const contributions: Contribution[] = [];

  for (const requirement of definition.requiredEvidence) {
    const classification = classifyRequirement(requirement, bundle, definition.key);
    contributions.push(requirement.contributesToSatisfaction === false ? "neutral" : classification.contribution);
    if (classification.gap) gaps.push(classification.gap);
    if (classification.unknownNote) unknownEvidence.push(classification.unknownNote);
    if (classification.supportingObservationId) supportingObservationIds.push(classification.supportingObservationId);
  }

  const status = aggregateStatus(contributions, definition.evidenceCombinator);

  // Reconciliation wording — when a "primary" requirement (one that
  // actually counts toward satisfaction) is itself satisfied ALONGSIDE a
  // source-limited Integration Gap, the gap describes a genuine
  // cross-system reconciliation question, not a plain "this source can't
  // see it" limitation. Never asserts either source is wrong.
  const anyPrimarySatisfied = definition.requiredEvidence.some(
    (req, i) => req.contributesToSatisfaction !== false && contributions[i] === "satisfied"
  );
  if (anyPrimarySatisfied) {
    gaps = gaps.map((gap) => {
      if (gap.kind !== "integration") return gap;
      const requirement = definition.requiredEvidence.find((r) => r.key === gap.requirementKey);
      const reconciliationNote = requirement?.negativeEvidence?.reconciliationNote;
      return reconciliationNote ? { ...gap, description: reconciliationNote } : gap;
    });
  }

  return {
    desiredStateKey: definition.key,
    desiredStateVersion: definition.version,
    status,
    gaps,
    unknownEvidence,
    explanation: buildExplanation(definition, status, gaps, unknownEvidence),
    supportingObservationIds,
  };
}
