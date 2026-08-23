// Client Readiness's Domain Interpretation of the shared, domain-agnostic
// engine — mirrors lib/emergencyPreparedness/emergencyPreparednessReadiness.ts's
// exact pattern: standard requirements route through
// evaluateRequirementSetStatus() completely unchanged; only the three
// requirements whose truth genuinely depends on canonical resident facts
// or applicability logic the engine can't express (Client Profile,
// Significant Events, Discharge) get bespoke composition — never a second
// evaluator.
import { evaluateRequirementSetStatus } from "../compliance/requirementSetStatus.ts";
import { deriveAuditReadinessStatus, type AuditReadinessStatus } from "../compliance/auditReadinessStatus.ts";
import { getRequirementSetWithRequirements } from "../data/personRequirements.ts";
import { getPersonEvidenceForSubject } from "../data/personEvidence.ts";
import { getResidentById } from "../data/residents.ts";
import {
  BESPOKE_COMPOSITION_CODES,
  CLIENT_RECORD_READINESS_SET_CODE,
  CR_CLIENT_PROFILE_ON_FILE,
  CR_DISCHARGE_SUMMARY_ON_FILE,
  CR_SIGNIFICANT_EVENTS_DOCUMENTED,
  EP_CLIENT_TRIAGE_CLASSIFIED,
} from "./constants.ts";
// Type-only, same discipline as the ServeRelationship import below — this
// file must stay free of residentTriageClassifications.ts's live-DB-
// fetching import (it has `import "server-only"`), or it would drag that
// into every client-bundle-reachable consumer of this file (ClientReadinessBoard
// -> AttentionCard -> auditReadinessDashboard.ts -> here). The resolved
// classification is always passed in by the caller — see
// getClientReadinessEvaluation() below.
import type { ResidentTriageClassification } from "../data/residentTriageClassifications.ts";
import type { PersonEvidence, PersonRequirement, Resident } from "../supabase/types.ts";
// Type-only — erased at build/strip time, so this never pulls
// residentServeRelationships.ts's live AxisCare-fetching import chain into
// this file's module graph (that chain uses @/-alias/extensionless imports
// and would break this file's standalone unit test). The canonical
// relationship value itself is always resolved by the caller (the one
// place actually allowed to hit the live projection pipeline) and passed
// in — see getClientReadinessEvaluation() below.
import type { ServeRelationship } from "../residents/serveRelationshipProjection.ts";

export interface ClientReadinessRequirementEvaluation {
  status: AuditReadinessStatus;
  explanation: string;
  requirement: PersonRequirement;
  latestEvidence: PersonEvidence | null;
}

export interface ClientReadinessEvaluation {
  resident: Resident;
  requirements: ClientReadinessRequirementEvaluation[];
  // Mirrors DomainReadinessRollup.readySubjectCount's per-subject contract
  // (true only when every *applicable* requirement is satisfied — not_
  // applicable ones excluded, same discipline as every other domain).
  ready: boolean;
}

// Client Identity & Core Information — reads canonical resident fields
// directly, never routed through the generic evidence engine (there is no
// single "evidence artifact" whose currency is being checked; the facts
// themselves ARE the satisfying truth). Legal guardian is the one
// exception requiring a real evidence row: "no guardian" must be an
// intentionally recorded fact (satisfaction_context =
// 'guardian_confirmed_none'), never inferred from blank fields.
//
// Deliberately checks ONLY the fields Serve P&P §301(a) actually names for
// the Client Profile: "full name, sex, date of birth, name of the
// client's legal guardian if applicable, physician's name and telephone
// number, emergency numbers and pertinent medical history, location that
// services are to be rendered" (see this codebase's own requirement-draft
// doc, docs/architecture/AUDIT_READINESS_CLIENT_RECORD_REQUIREMENT_DRAFT.md#1,
// which quotes this exact text). date_of_admission was added here on
// 2026-08-17 without support from that same authority text — an
// implementation error, not a policy requirement — and is removed as of
// the 2026-08-22 date-semantics correction. Admission/intake, planned
// service start, and actual start of care are distinct lifecycle facts
// per P&P §281/§293/§301(c)/§404 and are governed separately, never
// folded into this Client Profile check. (Emergency numbers and
// pertinent medical history are also named by §301(a) and not currently
// checked here either — a pre-existing gap, not something this pass
// introduces or claims to fix.)
export function evaluateClientProfile(
  resident: Resident,
  requirement: PersonRequirement,
  evidence: readonly PersonEvidence[]
): ClientReadinessRequirementEvaluation {
  const missing: string[] = [];
  if (!resident.first_name && !resident.last_name && !resident.display_name && !resident.full_name) missing.push("name");
  if (!resident.date_of_birth) missing.push("date of birth");
  if (!resident.sex && !resident.gender) missing.push("sex/gender");
  if (!resident.building && !resident.address) missing.push("service location");
  if (!resident.physician_name || !resident.physician_phone) missing.push("physician contact");

  const guardianAttestation = evidence.find(
    (e) =>
      e.requirement_id === requirement.id &&
      e.satisfaction_context === "guardian_confirmed_none" &&
      e.lifecycle_status === "active"
  );
  const guardianPopulated = Boolean(resident.legal_guardian_name && resident.legal_guardian_phone);
  const guardianResolved = guardianPopulated || Boolean(guardianAttestation);
  if (!guardianResolved) missing.push("legal guardian (or a confirmed none)");

  const latestEvidence = guardianAttestation ?? null;

  if (missing.length === 0) {
    return {
      status: "compliant",
      explanation: "All required client profile facts are on file.",
      requirement,
      latestEvidence,
    };
  }
  return {
    status: "missing_evidence",
    explanation: `Missing: ${missing.join(", ")}.`,
    requirement,
    latestEvidence,
  };
}

// Significant Client Events — zero recorded events is a legitimate
// not_applicable state, never a failure (§301h). Once one or more exist,
// EVERY recorded event must be documented — deliberately not routed
// through the shared engine's "most recent evidence only" rule, since this
// requirement is about the completeness of the whole event list, not the
// currency of one artifact. Known v0.1 limitation, disclosed rather than
// hidden: Serve OS can only evaluate events someone recorded — it cannot
// independently detect that an event occurred.
export function evaluateSignificantEvents(
  requirement: PersonRequirement,
  evidence: readonly PersonEvidence[]
): ClientReadinessRequirementEvaluation {
  const eventRows = evidence.filter((e) => e.requirement_id === requirement.id && e.lifecycle_status === "active");

  if (eventRows.length === 0) {
    return {
      status: "not_applicable",
      explanation: "No significant client events have been recorded.",
      requirement,
      latestEvidence: null,
    };
  }

  const mostRecent = eventRows.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const unverifiedCount = eventRows.filter((e) => e.verification_status !== "verified").length;

  if (unverifiedCount === 0) {
    return {
      status: "compliant",
      explanation: `${eventRows.length} significant event${eventRows.length === 1 ? "" : "s"} documented.`,
      requirement,
      latestEvidence: mostRecent,
    };
  }
  return {
    status: "needs_review",
    explanation: `${unverifiedCount} of ${eventRows.length} recorded significant event${eventRows.length === 1 ? "" : "s"} still need${eventRows.length === 1 ? "s" : ""} documentation review.`,
    requirement,
    latestEvidence: mostRecent,
  };
}

// Discharge / Transfer — not_applicable for every projected relationship
// except 'inactive_client' (the canonical projection's equivalent of an
// actual completed discharge/transfer — see
// serveRelationshipProjection.ts's own former_client -> inactive_client
// mapping), never merely "not active" (prospect/no_current_relationship
// are not discharges). Takes the CANONICAL projected relationship, not
// residents.serve_relationship_status directly — that raw column is only
// ever one last-resort fallback input into the real projection (see
// lib/residents/serveRelationshipProjection.ts), and reading it here
// directly would silently diverge from what /residents itself considers a
// former client. Once applicable, evaluated the standard way.
export function evaluateDischarge(
  relationship: ServeRelationship,
  requirement: PersonRequirement,
  evidence: readonly PersonEvidence[]
): ClientReadinessRequirementEvaluation {
  if (relationship !== "inactive_client") {
    return {
      status: "not_applicable",
      explanation: "Applicable only once the client is no longer active (discharged/transferred).",
      requirement,
      latestEvidence: null,
    };
  }

  const setEvaluation = evaluateRequirementSetStatus([requirement], evidence);
  const derived = deriveAuditReadinessStatus(setEvaluation);
  const r = derived.requirements[0];
  return { status: r.status, explanation: r.explanation, requirement, latestEvidence: r.requirementEvaluation.latestEvidence };
}

// Emergency Triage Classification — satisfaction is read directly from
// the governed resident_triage_classifications table (via the resolved
// "current" row the caller passes in, already effective-date-aware — see
// getCurrentResidentTriageClassification), never from whether a
// person_evidence row happens to exist for this requirement. This is
// deliberately NOT routed through the shared evidence-currency engine by
// default: unlike every standard requirement, the structured
// classification IS the satisfying fact, and person_evidence here is a
// downstream audit-trail mirror (syncCurrentTriageClassificationEvidence
// in evidence.ts) that can fail independently of the governed write
// without that failure being allowed to produce a false "Missing
// Evidence" state.
//
// currentClassification is `undefined` (distinct from `null`) for a
// caller that hasn't resolved it — e.g. auditReadinessDashboard.ts's bulk
// rollup, which must stay free of this table's live-fetching import for
// the same client-bundle-safety reason documented on the type import
// above. That caller still gets a correct answer, just via the standard
// evidence-currency path (no atomicity guarantee against a failed sync,
// which only matters immediately after a save on the resident's own
// profile page — the one caller that does resolve and pass this in).
export function evaluateTriageClassification(
  currentClassification: ResidentTriageClassification | null | undefined,
  requirement: PersonRequirement,
  evidence: readonly PersonEvidence[]
): ClientReadinessRequirementEvaluation {
  if (currentClassification === undefined) {
    const setEvaluation = evaluateRequirementSetStatus([requirement], evidence);
    const derived = deriveAuditReadinessStatus(setEvaluation);
    const r = derived.requirements[0];
    return { status: r.status, explanation: r.explanation, requirement, latestEvidence: r.requirementEvaluation.latestEvidence };
  }

  const latestEvidence =
    evidence
      .filter((e) => e.requirement_id === requirement.id && e.lifecycle_status === "active")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  if (!currentClassification) {
    return {
      status: "missing_evidence",
      explanation: "No current triage classification is on file.",
      requirement,
      latestEvidence,
    };
  }

  return {
    status: "compliant",
    explanation: `Triage classification on file: ${currentClassification.levelCode}.`,
    requirement,
    latestEvidence,
  };
}

// Population applicability gate (2026-08-23 semantic graft from the
// preserved sibling implementation, commit 6500be6) — standard Client
// Readiness requirements (Assessment, ISP, Service Agreement, Billing,
// Medication List, Care Documentation, Supervisory Visit, Triage) plus
// Client Profile were being evaluated against every resident regardless
// of their canonical Serve relationship — a prospect who has never
// received a single Serve service showed the same "N of 10
// missing_evidence" wall a genuine active client with real gaps would.
// That's not a missing requirement, it's a wrong population: nothing is
// actually due from someone who was never an active client.
//
// Scoped deliberately narrow: only 'prospect', 'no_current_relationship',
// and 'needs_review' are gated to not_applicable here.
// 'inactive_client' (a real former/discharged client) is NOT included —
// their historical compliance record while they WERE active is exactly
// what an auditor needs to see, and Discharge Summary's own applicability
// rule already depends on that same evidence staying visible for that
// relationship. 'active_client' is unaffected — full evaluation, as
// today. No second active-client flag: this reads the same canonical
// projectedRelationship parameter every other bespoke rule here already
// takes.
const RELATIONSHIPS_WITHOUT_APPLICABLE_CLIENT_READINESS: ReadonlySet<ServeRelationship> = new Set([
  "prospect",
  "no_current_relationship",
  "needs_review",
]);

const NOT_APPLICABLE_NO_ACTIVE_RELATIONSHIP_EXPLANATION =
  "Not currently applicable — no active Serve relationship.";

// Pure, independently-testable gate — the same predicate the resident
// profile page's own collapsible summary reads (never a second copy of
// this rule) to decide its default collapsed state and message.
export function isOutsideClientReadinessPopulation(relationship: ServeRelationship): boolean {
  return RELATIONSHIPS_WITHOUT_APPLICABLE_CLIENT_READINESS.has(relationship);
}

// Audit Readiness zero-active-client state correction — whether Client
// Readiness's requirement set exists at all, independent of population.
// getClientReadinessEvaluation() always needs a specific resident, so it
// cannot itself distinguish "no requirement data has ever been seeded"
// from "seeded, but this community/scope currently has zero eligible
// active clients." This is the population-independent check the
// dashboard rollup needs to make that distinction correctly (see
// lib/compliance/auditReadinessDashboard.ts's own comment on the bug this
// fixes: Firewheel with zero Active Clients was rendering "Coming Soon —
// Not Yet Configured" even though Client Readiness itself is fully seeded).
export async function isClientReadinessConfigured(): Promise<boolean> {
  const set = await getRequirementSetWithRequirements(CLIENT_RECORD_READINESS_SET_CODE);
  return Boolean(set && set.requirements.length > 0);
}

// projectedRelationship is the canonical ServeRelationshipProjection value
// for this resident (relationship field only — human_correction/AxisCare/
// CRM/legacy-fallback precedence already resolved) — always resolved by
// the caller via getResidentServeRelationships()/
// getResidentServeRelationshipProjection() (lib/data/residentServeRelationships.ts),
// never re-derived here. Required, not defaulted: a caller skipping this
// is a bug to surface at the call site, not silently paper over with a
// guess.
export async function getClientReadinessEvaluation(
  residentId: string,
  projectedRelationship: ServeRelationship,
  // Resolved by the caller, same discipline as projectedRelationship above
  // — omit entirely (leaving this `undefined`) from a context that must
  // stay free of residentTriageClassifications.ts's live-fetching import;
  // pass the real value (or explicit `null`) from any context that has
  // already resolved it, to get the atomicity guarantee documented on
  // evaluateTriageClassification() above.
  currentTriageClassification?: ResidentTriageClassification | null
): Promise<ClientReadinessEvaluation | null> {
  const resident = await getResidentById(residentId);
  if (!resident) return null;

  const [set, evidence] = await Promise.all([
    getRequirementSetWithRequirements(CLIENT_RECORD_READINESS_SET_CODE),
    getPersonEvidenceForSubject("resident", residentId),
  ]);

  const allRequirements = set?.requirements ?? [];
  const standardRequirements = allRequirements.filter((r) => !BESPOKE_COMPOSITION_CODES.has(r.requirement_code));
  const bespokeByCode = new Map(
    allRequirements.filter((r) => BESPOKE_COMPOSITION_CODES.has(r.requirement_code)).map((r) => [r.requirement_code, r])
  );

  const noApplicablePopulation = isOutsideClientReadinessPopulation(projectedRelationship);

  const requirements: ClientReadinessRequirementEvaluation[] = noApplicablePopulation
    ? standardRequirements.map((requirement) => ({
        status: "not_applicable",
        explanation: NOT_APPLICABLE_NO_ACTIVE_RELATIONSHIP_EXPLANATION,
        requirement,
        latestEvidence: null,
      }))
    : deriveAuditReadinessStatus(evaluateRequirementSetStatus(standardRequirements, evidence)).requirements.map((r) => ({
        status: r.status,
        explanation: r.explanation,
        requirement: r.requirementEvaluation.requirement,
        latestEvidence: r.requirementEvaluation.latestEvidence,
      }));

  const profileRequirement = bespokeByCode.get(CR_CLIENT_PROFILE_ON_FILE);
  if (profileRequirement) {
    requirements.push(
      noApplicablePopulation
        ? { status: "not_applicable", explanation: NOT_APPLICABLE_NO_ACTIVE_RELATIONSHIP_EXPLANATION, requirement: profileRequirement, latestEvidence: null }
        : evaluateClientProfile(resident, profileRequirement, evidence)
    );
  }

  const eventsRequirement = bespokeByCode.get(CR_SIGNIFICANT_EVENTS_DOCUMENTED);
  if (eventsRequirement) requirements.push(evaluateSignificantEvents(eventsRequirement, evidence));

  const dischargeRequirement = bespokeByCode.get(CR_DISCHARGE_SUMMARY_ON_FILE);
  if (dischargeRequirement) requirements.push(evaluateDischarge(projectedRelationship, dischargeRequirement, evidence));

  // Triage is one of the standard requirements the population gate above
  // was designed to cover (see its own comment) — it's only bespoke here
  // because its satisfaction is read from a governed table rather than
  // generic evidence, not because it should escape the same applicability
  // rule every other standard requirement follows.
  const triageRequirement = bespokeByCode.get(EP_CLIENT_TRIAGE_CLASSIFIED);
  if (triageRequirement) {
    requirements.push(
      noApplicablePopulation
        ? { status: "not_applicable", explanation: NOT_APPLICABLE_NO_ACTIVE_RELATIONSHIP_EXPLANATION, requirement: triageRequirement, latestEvidence: null }
        : evaluateTriageClassification(currentTriageClassification, triageRequirement, evidence)
    );
  }

  // Preserve the requirement set's own sort_order rather than the
  // standard/bespoke split order above.
  const orderByRequirementId = new Map(allRequirements.map((r, i) => [r.id, i]));
  requirements.sort((a, b) => (orderByRequirementId.get(a.requirement.id) ?? 0) - (orderByRequirementId.get(b.requirement.id) ?? 0));

  const applicable = requirements.filter((r) => r.status !== "not_applicable");
  const ready =
    applicable.length > 0 &&
    applicable.every((r) => r.status === "compliant" || r.status === "satisfied_by_event" || r.status === "exception");

  return { resident, requirements, ready };
}
