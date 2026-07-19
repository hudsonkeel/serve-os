import type {
  Relationship,
  RelationshipAction,
  RelationshipCommitment,
  RelationshipInsight,
  RelationshipOpenLoop,
  RelationshipTouch,
} from "../supabase/types.ts";
import {
  RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS,
  RELATIONSHIP_INSIGHT_CATEGORY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_TOUCH_TYPE_LABELS,
} from "./constants.ts";

// Deterministic, template-based Relationship Brief generator — Relationship
// Intelligence Phase 1. See
// docs/architecture/relationship-intelligence-phase-1-implementation.md's
// "Grounding rules" section before changing anything here.
//
// The one rule every function in this file must hold: never state
// something the input data doesn't actually contain. When a section has no
// grounding data, say so plainly (an uncertainty statement) rather than
// omitting the section or inventing plausible-sounding content. Every
// non-uncertainty sentence must carry at least one `basedOn` reference to
// the specific record it came from.
//
// `narrativeRefiner` is a documented, currently-unused extension seam — no
// approved AI provider exists in Serve OS yet (see the scope this phase
// implements). A future approved provider could wrap this function's
// deterministic output to improve phrasing without this file's data
// contract changing at all.

export type SourceReferenceKind = "interaction" | "insight" | "commitment" | "open_loop" | "next_action" | "relationship";

export interface SourceReference {
  readonly kind: SourceReferenceKind;
  readonly id: string;
  readonly label: string;
}

export interface RelationshipBriefSection {
  readonly heading: string;
  readonly body: string;
  readonly basedOn: readonly SourceReference[];
}

export interface RecommendedFollowUp {
  readonly opening: string;
  readonly primaryQuestion: string;
  readonly suggestedNextStep: string;
  readonly basedOn: readonly SourceReference[];
}

export interface RelationshipBrief {
  readonly context: RelationshipBriefSection;
  readonly whatMatters: RelationshipBriefSection;
  readonly currentGoal: RelationshipBriefSection;
  readonly openCommitments: RelationshipBriefSection;
  readonly openLoops: RelationshipBriefSection;
  readonly nextAction: RelationshipBriefSection;
  readonly recommendedFollowUp: RecommendedFollowUp;
  readonly basedOn: readonly SourceReference[];
  readonly generatedAt: string;
}

export interface RelationshipBriefInput {
  readonly relationship: Relationship;
  // Most-recent-first. Only the first few are used for Context/the Opening.
  readonly recentInteractions: readonly RelationshipTouch[];
  readonly activeInsights: readonly RelationshipInsight[];
  readonly openCommitments: readonly RelationshipCommitment[];
  readonly openLoops: readonly RelationshipOpenLoop[];
  readonly currentNextAction: RelationshipAction | null;
}

export type NarrativeRefiner = (draft: RelationshipBrief) => RelationshipBrief;

export interface GenerateRelationshipBriefOptions {
  readonly narrativeRefiner?: NarrativeRefiner;
  readonly now?: () => Date;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function interactionRef(interaction: RelationshipTouch): SourceReference {
  return {
    kind: "interaction",
    id: interaction.id,
    label: `${RELATIONSHIP_TOUCH_TYPE_LABELS[interaction.touch_type]} logged ${formatDate(interaction.occurred_at)}`,
  };
}

function insightRef(insight: RelationshipInsight): SourceReference {
  return { kind: "insight", id: insight.id, label: `Insight: ${insight.content}` };
}

function commitmentRef(commitment: RelationshipCommitment): SourceReference {
  return { kind: "commitment", id: commitment.id, label: `Commitment: ${commitment.description}` };
}

function openLoopRef(openLoop: RelationshipOpenLoop): SourceReference {
  return { kind: "open_loop", id: openLoop.id, label: `Open Loop: ${openLoop.question}` };
}

function nextActionRef(action: RelationshipAction): SourceReference {
  return { kind: "next_action", id: action.id, label: `Next Action: ${action.title}` };
}

function relationshipStageRef(relationship: Relationship): SourceReference {
  return {
    kind: "relationship",
    id: relationship.id,
    label: `Current stage: ${RELATIONSHIP_STAGE_LABELS[relationship.stage]}`,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────

function buildContext(interactions: readonly RelationshipTouch[]): RelationshipBriefSection {
  if (interactions.length === 0) {
    return {
      heading: "Context",
      body: "No interactions have been logged for this relationship yet.",
      basedOn: [],
    };
  }

  const recent = interactions.slice(0, 3);
  const [latest, ...earlier] = recent;
  let body = `${interactions.length} interaction${interactions.length === 1 ? "" : "s"} logged. Most recently, a ${RELATIONSHIP_TOUCH_TYPE_LABELS[latest.touch_type].toLowerCase()} on ${formatDate(latest.occurred_at)}: "${latest.summary}"`;
  if (earlier.length > 0) {
    body += ` Before that: ${earlier.map((i) => `a ${RELATIONSHIP_TOUCH_TYPE_LABELS[i.touch_type].toLowerCase()} on ${formatDate(i.occurred_at)}`).join("; ")}.`;
  } else {
    body += ".";
  }

  return { heading: "Context", body, basedOn: recent.map(interactionRef) };
}

// ─── What Matters ─────────────────────────────────────────────────────────

function buildWhatMatters(insights: readonly RelationshipInsight[]): RelationshipBriefSection {
  if (insights.length === 0) {
    return {
      heading: "What Matters",
      body: "No durable context has been recorded yet — this family or resident's preferences, concerns, and decision dynamics are not yet known.",
      basedOn: [],
    };
  }

  const body = insights
    .map((i) => `${RELATIONSHIP_INSIGHT_CATEGORY_LABELS[i.category]}: ${i.content}`)
    .join(" ");

  return { heading: "What Matters", body, basedOn: insights.map(insightRef) };
}

// ─── Current Goal ─────────────────────────────────────────────────────────

const STAGE_GOALS: Record<Relationship["stage"], string> = {
  new_inquiry: "Make initial contact and understand what this family or resident needs.",
  contact_attempted: "Reach the family or resident to begin the conversation.",
  connected: "Continue the conversation and understand needs, timing, and decision-makers.",
  discovery: "Complete discovery on needs, preferences, and decision dynamics before proposing services.",
  assessment_scheduled: "Complete the scheduled assessment.",
  assessment_completed: "Move from a completed assessment toward a proposal.",
  proposal_in_progress: "Finish preparing the proposal.",
  proposal_sent: "Follow up on the sent proposal and help the family reach a decision.",
  considering: "Support the family through their decision-making process.",
  follow_up_needed: "Re-engage — a follow-up is needed to keep this relationship moving.",
  ready_to_start: "Finalize details and begin service.",
  won: "Support a smooth start of service.",
  on_hold: "Check in periodically; this relationship is paused, not active.",
  closed_lost: "This relationship is closed and not currently moving forward.",
};

function buildCurrentGoal(relationship: Relationship): RelationshipBriefSection {
  return {
    heading: "Current Goal",
    body: STAGE_GOALS[relationship.stage],
    basedOn: [relationshipStageRef(relationship)],
  };
}

// ─── Open Commitments ─────────────────────────────────────────────────────

function buildOpenCommitments(commitments: readonly RelationshipCommitment[]): RelationshipBriefSection {
  if (commitments.length === 0) {
    return { heading: "Open Commitments", body: "No commitments are currently open.", basedOn: [] };
  }

  const body = commitments
    .map((c) => {
      const party = RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS[c.responsible_party_type];
      const who = c.responsible_party_reference ? `${party} (${c.responsible_party_reference})` : party;
      const when = c.expected_date ? ` — expected ${formatDate(c.expected_date)}` : "";
      return `${who}: ${c.description}${when}.`;
    })
    .join(" ");

  return { heading: "Open Commitments", body, basedOn: commitments.map(commitmentRef) };
}

// ─── Open Loops ───────────────────────────────────────────────────────────

function buildOpenLoops(openLoops: readonly RelationshipOpenLoop[]): RelationshipBriefSection {
  if (openLoops.length === 0) {
    return { heading: "Open Loops", body: "No open questions are currently tracked.", basedOn: [] };
  }

  const body = openLoops
    .map((o) => {
      const owner = o.owner ? ` (owner: ${o.owner})` : "";
      return `${o.question}${owner}`;
    })
    .join(" ");

  return { heading: "Open Loops", body, basedOn: openLoops.map(openLoopRef) };
}

// ─── Next Action ──────────────────────────────────────────────────────────

function buildNextAction(action: RelationshipAction | null): RelationshipBriefSection {
  if (!action) {
    return {
      heading: "Next Action",
      body: "There is no current next action recorded for this relationship.",
      basedOn: [],
    };
  }

  const due = action.due_at ? `, due ${formatDate(action.due_at)}` : ", no due date set";
  const owner = action.assigned_to ? action.assigned_to : "unassigned";
  return {
    heading: "Next Action",
    body: `${action.title} — owned by ${owner}${due}.`,
    basedOn: [nextActionRef(action)],
  };
}

// ─── Recommended Follow-Up ────────────────────────────────────────────────

function buildRecommendedFollowUp(input: RelationshipBriefInput): RecommendedFollowUp {
  const basedOn: SourceReference[] = [];

  let opening: string;
  const latestInteraction = input.recentInteractions[0];
  const openCommitment = input.openCommitments[0];
  if (latestInteraction) {
    opening = `Reference the last interaction (${formatDate(latestInteraction.occurred_at)}): "${latestInteraction.summary}"`;
    basedOn.push(interactionRef(latestInteraction));
    if (openCommitment) {
      opening += ` and confirm whether "${openCommitment.description}" has moved forward.`;
      basedOn.push(commitmentRef(openCommitment));
    } else {
      opening += ".";
    }
  } else {
    opening =
      "There isn't yet a specific detail from a prior conversation to reference — this may be a good opportunity for an initial, open-ended check-in.";
  }

  let primaryQuestion: string;
  const openLoop = input.openLoops[0];
  if (openLoop) {
    primaryQuestion = openLoop.question;
    basedOn.push(openLoopRef(openLoop));
  } else {
    primaryQuestion =
      "There is no single unresolved question currently on record — consider an open-ended question about how the family or resident is feeling about next steps.";
  }

  let suggestedNextStep: string;
  if (input.currentNextAction) {
    suggestedNextStep = `Proceed with the current next action: ${input.currentNextAction.title}.`;
    basedOn.push(nextActionRef(input.currentNextAction));
  } else {
    suggestedNextStep = `Given the relationship is at the ${RELATIONSHIP_STAGE_LABELS[input.relationship.stage]} stage, the appropriate next step is likely to progress it further, though no specific next action is currently recorded.`;
    basedOn.push(relationshipStageRef(input.relationship));
  }

  return { opening, primaryQuestion, suggestedNextStep, basedOn };
}

// ─── Top-level generator ──────────────────────────────────────────────────

function dedupeReferences(refs: readonly SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  const result: SourceReference[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

export function generateRelationshipBrief(
  input: RelationshipBriefInput,
  options: GenerateRelationshipBriefOptions = {},
): RelationshipBrief {
  const now = options.now ?? (() => new Date());

  const context = buildContext(input.recentInteractions);
  const whatMatters = buildWhatMatters(input.activeInsights);
  const currentGoal = buildCurrentGoal(input.relationship);
  const openCommitments = buildOpenCommitments(input.openCommitments);
  const openLoops = buildOpenLoops(input.openLoops);
  const nextAction = buildNextAction(input.currentNextAction);
  const recommendedFollowUp = buildRecommendedFollowUp(input);

  const basedOn = dedupeReferences([
    ...context.basedOn,
    ...whatMatters.basedOn,
    ...currentGoal.basedOn,
    ...openCommitments.basedOn,
    ...openLoops.basedOn,
    ...nextAction.basedOn,
    ...recommendedFollowUp.basedOn,
  ]);

  const draft: RelationshipBrief = {
    context,
    whatMatters,
    currentGoal,
    openCommitments,
    openLoops,
    nextAction,
    recommendedFollowUp,
    basedOn,
    generatedAt: now().toISOString(),
  };

  // Not called in Phase 1 — no approved AI provider exists in Serve OS yet.
  // See this file's module comment.
  return options.narrativeRefiner ? options.narrativeRefiner(draft) : draft;
}
