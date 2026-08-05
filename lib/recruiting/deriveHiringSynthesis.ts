import type {
  CollectorMatchStatus,
  CollectorRunStatus,
  CollectorSourceSystem,
  InferenceStrength,
  RecruitingLeadHumanConfirmation,
  RecruitingLeadObservation,
  RecruitingLeadStatus,
} from "../supabase/types.ts";

// Deterministic synthesis for the Recruiting Lead Flight — see
// docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md §5. Pure function, no
// I/O: collectors report observations only (already persisted elsewhere);
// this function derives current state, requirement status, unknowns,
// exceptions, and a recommendation from those observations plus the
// existing recruiting_leads.status, which it only ever reads, never writes.
//
// The one invariant every branch below must hold: 'not_found' (a search
// result) and 'not_visible' (a field that couldn't be determined) may only
// ever produce an "unknown"/"exception" outcome, never a "requirement
// unmet" or any other negative conclusion. A requirement is only ever
// "unmet" when an observation was directly_observed and its value itself
// indicates the requirement isn't satisfied — a real, confirmed fact, not
// an inference from missing access. See __tests__/deriveHiringSynthesis.test.ts.

export interface SourceReference {
  readonly label: string;
  readonly observationKey: string | null; // null for a reference to recruiting_leads.status itself
  readonly observedAt: string | null;
  readonly sourceSystem: CollectorSourceSystem | "serve_os";
}

export type RequirementStatus = "met" | "unmet" | "unknown";

export interface RequirementLine {
  readonly key: string;
  readonly label: string;
  readonly status: RequirementStatus;
  readonly basedOn: SourceReference[];
}

// Deterministically Inferred — the shape this function consumes, matching
// lib/data/recruitingLeadEvidence.ts's InferenceWithEvidence without taking
// a dependency on the data layer (this function stays pure, no I/O).
export interface InferenceInput {
  readonly signalKey: string;
  readonly explanation: string;
  readonly strength: InferenceStrength;
  readonly unresolvedAlternatives: readonly string[];
  readonly evidenceNeededToResolve: readonly string[];
  readonly computedAt: string;
}

// The three evidence classes are structurally separate all the way
// through this module — HiringSynthesis never merges observations,
// inferences, and human confirmations into one generic list. Each is its
// own field, rendered by its own UI component
// (DirectObservationsPanel / InferredSignalsPanel / HumanConfirmationsPanel).
export interface HiringSynthesis {
  readonly currentState: string;
  readonly requirements: readonly RequirementLine[];
  readonly inferences: readonly InferenceInput[];
  readonly humanConfirmations: readonly RecruitingLeadHumanConfirmation[];
  readonly unknowns: readonly string[];
  readonly exceptions: readonly string[];
  readonly recommendation: string;
  readonly why: readonly SourceReference[];
}

export interface VendorEvidenceInput {
  readonly runStatus: CollectorRunStatus;
  readonly matchStatus: CollectorMatchStatus | null;
  readonly observations: readonly RecruitingLeadObservation[];
  readonly observedAt: string | null; // most recent collector run's completed_at/started_at
}

export interface DeriveHiringSynthesisInput {
  readonly leadStatus: RecruitingLeadStatus;
  readonly apploi: VendorEvidenceInput | null;
  readonly viventium: VendorEvidenceInput | null;
  // Optional — omitted entirely by callers that haven't run rule
  // evaluation yet (e.g. existing tests). Never required for this
  // function to produce a safe, grounded result.
  readonly inferences?: readonly InferenceInput[];
  readonly humanConfirmations?: readonly RecruitingLeadHumanConfirmation[];
}

function findObservation(
  evidence: VendorEvidenceInput | null,
  key: string
): RecruitingLeadObservation | undefined {
  return evidence?.observations.find((o) => o.observation_key === key);
}

function refFor(
  sourceSystem: CollectorSourceSystem,
  obs: RecruitingLeadObservation | undefined,
  fallbackLabel: string,
  fallbackObservedAt: string | null
): SourceReference {
  if (!obs) {
    return { label: fallbackLabel, observationKey: null, observedAt: fallbackObservedAt, sourceSystem };
  }
  return {
    label: obs.raw_label ?? fallbackLabel,
    observationKey: obs.observation_key,
    observedAt: obs.observed_at,
    sourceSystem,
  };
}

// A directly_observed value counts as "met" only for its documented
// positive value(s) — everything else directly_observed is a real,
// confirmed "unmet". Anything not directly_observed is "unknown", never
// "unmet" — this is the function's one hard rule, enforced here in exactly
// one place so every requirement below goes through it.
function requirementStatus(
  obs: RecruitingLeadObservation | undefined,
  metValues: readonly string[]
): RequirementStatus {
  if (!obs || obs.visibility !== "directly_observed") return "unknown";
  if (obs.normalized_value === null) return "unknown";
  return metValues.includes(obs.normalized_value) ? "met" : "unmet";
}

function apploiRequirements(apploi: VendorEvidenceInput | null): RequirementLine[] {
  const started = findObservation(apploi, "apploi.application_started");
  const submitted = findObservation(apploi, "apploi.application_submitted");
  const interviewScheduled = findObservation(apploi, "apploi.interview_scheduled");
  const interviewCompleted = findObservation(apploi, "apploi.interview_completed");

  const at = apploi?.observedAt ?? null;
  return [
    {
      key: "apploi_application_started",
      label: "Apploi application started",
      status: requirementStatus(started, ["true"]),
      basedOn: [refFor("apploi", started, "Application started", at)],
    },
    {
      key: "apploi_application_submitted",
      label: "Apploi application submitted",
      status: requirementStatus(submitted, ["true"]),
      basedOn: [refFor("apploi", submitted, "Application submitted", at)],
    },
    {
      key: "apploi_interview_scheduled",
      label: "Apploi interview scheduled",
      status: requirementStatus(interviewScheduled, ["true"]),
      basedOn: [refFor("apploi", interviewScheduled, "Interview scheduled", at)],
    },
    {
      key: "apploi_interview_completed",
      label: "Apploi interview completed",
      status: requirementStatus(interviewCompleted, ["true"]),
      basedOn: [refFor("apploi", interviewCompleted, "Interview completed", at)],
    },
  ];
}

function viventiumRequirements(viventium: VendorEvidenceInput | null): RequirementLine[] {
  const i9 = findObservation(viventium, "viventium.i9_status");
  const w4 = findObservation(viventium, "viventium.w4_status");
  const directDeposit = findObservation(viventium, "viventium.direct_deposit_status");

  const at = viventium?.observedAt ?? null;
  return [
    {
      key: "viventium_i9_completed",
      label: "Viventium I-9 completed",
      status: requirementStatus(i9, ["completed"]),
      basedOn: [refFor("viventium", i9, "I-9 status", at)],
    },
    {
      key: "viventium_w4_completed",
      label: "Viventium W-4 completed",
      status: requirementStatus(w4, ["completed"]),
      basedOn: [refFor("viventium", w4, "W-4 status", at)],
    },
    {
      key: "viventium_direct_deposit_completed",
      label: "Viventium direct deposit set up",
      status: requirementStatus(directDeposit, ["completed"]),
      basedOn: [refFor("viventium", directDeposit, "Direct deposit status", at)],
    },
  ];
}

function vendorSearchNote(
  vendor: "Apploi" | "Viventium",
  evidence: VendorEvidenceInput | null,
  unknowns: string[],
  exceptions: string[]
): void {
  if (!evidence) {
    unknowns.push(`No ${vendor} search has been performed yet.`);
    return;
  }
  if (evidence.runStatus === "failed") {
    exceptions.push(
      `${vendor}: the last collector run failed (${evidence.matchStatus ?? "no result"}). This does not indicate the candidate has no ${vendor} record — the source could not be reached.`
    );
    return;
  }
  switch (evidence.matchStatus) {
    case "not_found":
      exceptions.push(
        `${vendor}: no matching record was found in this search. This is a search result, not evidence the candidate never applied — the search terms may need refinement.`
      );
      break;
    case "ambiguous_multiple_matches":
      exceptions.push(`${vendor}: more than one possible match was found. A human must confirm which record is correct before this evidence can be trusted.`);
      break;
    case "search_incomplete":
      exceptions.push(`${vendor}: the search did not complete. This does not indicate a negative result.`);
      break;
    case "found":
      break;
    default:
      unknowns.push(`${vendor} search result is not recorded.`);
  }
}

// Inference signalKeys that represent an inconsistency/exception rather
// than a plain positive signal — these surface as exceptions, never as an
// unremarkable inference alongside the others, matching the requirement
// that inconsistencies stay visually and semantically distinct.
const EXCEPTION_SIGNAL_KEYS = new Set([
  "recruiting.possible_pipeline_stage_inconsistency",
  "recruiting.cross_system_stage_inconsistency",
]);

export function deriveHiringSynthesis(input: DeriveHiringSynthesisInput): HiringSynthesis {
  const unknowns: string[] = [];
  const exceptions: string[] = [];
  const why: SourceReference[] = [];
  const inferences = input.inferences ?? [];
  const humanConfirmations = input.humanConfirmations ?? [];

  // Every inference's own evidence-needed-to-resolve becomes an unknown —
  // this is the deterministic layer telling us, explicitly, what it
  // doesn't yet know, never papered over by the inference's own existence.
  for (const inference of inferences) {
    for (const need of inference.evidenceNeededToResolve) {
      if (!unknowns.includes(need)) unknowns.push(need);
    }
    if (EXCEPTION_SIGNAL_KEYS.has(inference.signalKey)) {
      exceptions.push(inference.explanation);
    }
  }

  why.push({
    label: `Serve OS recruiting status: ${input.leadStatus}`,
    observationKey: null,
    observedAt: null,
    sourceSystem: "serve_os",
  });

  vendorSearchNote("Apploi", input.apploi, unknowns, exceptions);
  vendorSearchNote("Viventium", input.viventium, unknowns, exceptions);

  const apploiFound = input.apploi?.matchStatus === "found";
  const viventiumFound = input.viventium?.matchStatus === "found";

  const apploiReqs = apploiFound ? apploiRequirements(input.apploi) : [];
  const viventiumReqs = viventiumFound ? viventiumRequirements(input.viventium) : [];
  const requirements = [...apploiReqs, ...viventiumReqs];

  for (const r of requirements) {
    if (r.status === "unknown") unknowns.push(`${r.label}: not yet confirmed.`);
    why.push(...r.basedOn);
  }

  // ─── Ordered, first-match-wins synthesis — mirrors the representative
  // table in docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md §5. Falls
  // through to a generic, fact-only summary if nothing more specific
  // applies — never invents a narrative beyond what was actually observed.
  let currentState: string;
  let recommendation: string;

  const i9Status = viventiumReqs.find((r) => r.key === "viventium_i9_completed")?.status;
  const interviewScheduled = apploiReqs.find((r) => r.key === "apploi_interview_scheduled")?.status;
  const interviewCompleted = apploiReqs.find((r) => r.key === "apploi_interview_completed")?.status;
  const applicationSubmitted = apploiReqs.find((r) => r.key === "apploi_application_submitted")?.status;
  const applicationStarted = apploiReqs.find((r) => r.key === "apploi_application_started")?.status;

  const crossSystemInconsistency = inferences.find(
    (i) => i.signalKey === "recruiting.cross_system_stage_inconsistency"
  );
  const stageInconsistency = inferences.find(
    (i) => i.signalKey === "recruiting.possible_pipeline_stage_inconsistency"
  );
  const completionUnconfirmed = inferences.find(
    (i) => i.signalKey === "recruiting.interview_completion_unconfirmed"
  );

  if (!input.apploi && !input.viventium) {
    currentState = "No vendor evidence has been collected yet for this lead.";
    recommendation = "Run the recruiting lead collector flight to gather Apploi and Viventium evidence.";
  } else if (crossSystemInconsistency) {
    // Inference-driven synthesis takes priority over the plain
    // found/not-found branches below — it is a more specific, better-
    // evidenced conclusion than "Apploi found, Viventium found" alone.
    currentState = crossSystemInconsistency.explanation;
    recommendation =
      "Review the candidate timeline and Viventium onboarding evidence, confirm the actual hiring decision/readiness state, and reconcile Apploi's stage if it is stale.";
  } else if (stageInconsistency) {
    currentState = stageInconsistency.explanation;
    recommendation = "Review the candidate's recent activity and confirm whether the current pipeline stage is still accurate.";
  } else if (completionUnconfirmed) {
    currentState = completionUnconfirmed.explanation;
    recommendation = "Confirm the interview outcome directly in Apploi — do not assume it did or didn't happen.";
  } else if (viventiumFound && i9Status === "met") {
    currentState = "Onboarding is underway in Viventium (I-9 on file).";
    recommendation = "Confirm remaining onboarding forms (W-4, direct deposit) are complete.";
  } else if (apploiFound && !viventiumFound) {
    currentState = "Active in Apploi; no Viventium record found yet.";
    recommendation =
      "No action needed on Viventium yet if the candidate has not been formally hired — this is expected at earlier stages, not a gap.";
  } else if (interviewScheduled === "met" && interviewCompleted !== "met") {
    currentState = "Interview scheduled in Apploi; completion not confirmed.";
    recommendation = "Confirm the interview outcome directly in Apploi — do not assume it did or didn't happen.";
  } else if (applicationSubmitted === "met") {
    currentState = "Application submitted in Apploi; next steps pending.";
    recommendation = "Review the application in Apploi and determine the next recruiting step.";
  } else if (applicationStarted === "met") {
    currentState = "Application started but not yet confirmed submitted in Apploi.";
    recommendation = "Check with the candidate or Apploi directly on submission status.";
  } else if (!apploiFound && !viventiumFound) {
    currentState = "No matching record found in Apploi or Viventium.";
    recommendation = "Confirm identifying details (name, email) and search again — this is not evidence the candidate never applied.";
  } else {
    currentState = "Vendor evidence collected; no further specific pattern recognized.";
    recommendation = "Review the recorded observations directly.";
  }

  for (const confirmation of humanConfirmations) {
    why.push({
      label: `Human confirmed: ${confirmation.confirmation_key} = ${confirmation.confirmed_value} (${confirmation.actor})`,
      observationKey: null,
      observedAt: confirmation.confirmed_at,
      sourceSystem: "serve_os",
    });
  }

  return {
    currentState,
    requirements,
    inferences,
    humanConfirmations,
    unknowns,
    exceptions,
    recommendation,
    why,
  };
}
