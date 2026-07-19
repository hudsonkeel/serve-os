import { createServerClient } from "../supabase/server.ts";

// Data layer for the generic Serve Decision Intelligence service
// (lib/intelligence/decisionEngine/). Every write goes through the atomic
// `record_decision()` / `intelligence_ensure_rule_version()` RPCs
// (supabase/migrations/20260724000000_create_intelligence_kernel_persistence.sql)
// — this file never writes to intelligence_* tables directly. Generic by
// design: nothing here is Background-Eligibility- or Governance-specific,
// even though Background Eligibility is the only caller today.

export interface EnsureRuleVersionInput {
  domain: string;
  ruleSlug: string;
  ruleTitle: string;
  ruleDescription: string;
  version: number;
  triggerType: "event" | "state" | "time";
  parameters: Record<string, unknown>;
  logicReference: string;
  policyReferences: readonly unknown[];
  authorityReferences: readonly unknown[];
  changelogNote?: string | null;
}

export async function ensureRuleVersion(input: EnsureRuleVersionInput): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("intelligence_ensure_rule_version", {
    p_domain: input.domain,
    p_rule_slug: input.ruleSlug,
    p_rule_title: input.ruleTitle,
    p_rule_description: input.ruleDescription,
    p_version: input.version,
    p_trigger_type: input.triggerType,
    p_parameters: input.parameters,
    p_logic_reference: input.logicReference,
    p_policy_references: input.policyReferences,
    p_authority_references: input.authorityReferences,
    p_changelog_note: input.changelogNote ?? null,
  });

  if (error) {
    console.error("[decisionEngine:ensureRuleVersion:error]", { input, message: error.message });
    return null;
  }
  return data as string;
}

export interface RecordDecisionInput {
  subjectType: string;
  subjectId: string;
  subjectCanonicalTable: string | null;
  subjectCanonicalId: string | null;
  domain: string;
  factType: string;
  factOccurredAt: string;
  factPayload: Record<string, unknown>;
  factProvenanceSourceSystem: string;
  factProvenanceSourceRecordId: string | null;
  factProvenanceConfidence: "confirmed" | "inferred" | "unknown";
  ruleVersionId: string;
  signalType: string;
  signalSeverity: "routine" | "monitor" | "important" | "urgent";
  recommendationType: string;
  recommendationTitle: string;
  recommendationDescription: string;
  recommendationPriority: "routine" | "monitor" | "important" | "urgent";
  explanationWhatHappened: string;
  explanationWhyFlagged: string;
  explanationSummary: string;
  explanationRecommendedConsideration: string;
  supersedesRecommendationId?: string | null;
  force?: boolean;
}

export async function recordDecision(input: RecordDecisionInput): Promise<{ recommendationId?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("record_decision", {
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_subject_canonical_table: input.subjectCanonicalTable,
    p_subject_canonical_id: input.subjectCanonicalId,
    p_domain: input.domain,
    p_fact_type: input.factType,
    p_fact_occurred_at: input.factOccurredAt,
    p_fact_payload: input.factPayload,
    p_fact_provenance_source_system: input.factProvenanceSourceSystem,
    p_fact_provenance_source_record_id: input.factProvenanceSourceRecordId,
    p_fact_provenance_confidence: input.factProvenanceConfidence,
    p_rule_version_id: input.ruleVersionId,
    p_signal_type: input.signalType,
    p_signal_severity: input.signalSeverity,
    p_recommendation_type: input.recommendationType,
    p_recommendation_title: input.recommendationTitle,
    p_recommendation_description: input.recommendationDescription,
    p_recommendation_priority: input.recommendationPriority,
    p_explanation_what_happened: input.explanationWhatHappened,
    p_explanation_why_flagged: input.explanationWhyFlagged,
    p_explanation_summary: input.explanationSummary,
    p_explanation_recommended_consideration: input.explanationRecommendedConsideration,
    p_supersedes_recommendation_id: input.supersedesRecommendationId ?? null,
    p_force: input.force ?? false,
  });

  if (error) {
    console.error("[decisionEngine:recordDecision:error]", { input, message: error.message });
    return { error: error.message };
  }
  return { recommendationId: data as string };
}

export interface SettledRecommendation {
  id: string;
  status: string;
  supersedesRecommendationId: string | null;
}

export async function findSettledRecommendation(
  subjectType: string,
  subjectId: string,
  ruleVersionId: string,
): Promise<SettledRecommendation | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("intelligence_find_settled_recommendation", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_rule_version_id: ruleVersionId,
  });

  if (error) {
    console.error("[decisionEngine:findSettledRecommendation:error]", { subjectType, subjectId, message: error.message });
    return null;
  }
  if (!data || !(data as { id?: string }).id) return null;
  const row = data as { id: string; status: string; supersedes_recommendation_id: string | null };
  return { id: row.id, status: row.status, supersedesRecommendationId: row.supersedes_recommendation_id };
}

// ─── Reads ────────────────────────────────────────────────────────────

export interface DecisionListRow {
  id: string;
  domain: string;
  recommendationType: string;
  subjectType: string;
  subjectId: string;
  title: string;
  suggestedPriority: string;
  status: string;
  createdAt: string;
  supersedesRecommendationId: string | null;
}

// Only "current" decisions — a recommendation superseded by a newer one is
// excluded from the list (still reachable from the newer decision's detail
// page via the one-link-back note).
export async function getDecisions(domain: string): Promise<DecisionListRow[]> {
  const supabase = createServerClient();

  const { data: superseded, error: supersededError } = await supabase
    .from("intelligence_recommendations")
    .select("supersedes_recommendation_id")
    .not("supersedes_recommendation_id", "is", null);

  if (supersededError) {
    console.error("[decisionEngine:getDecisions:error]", supersededError.message);
    return [];
  }
  const supersededIds = (superseded ?? [])
    .map((r) => r.supersedes_recommendation_id as string)
    .filter((id): id is string => Boolean(id));

  let query = supabase
    .from("intelligence_recommendations")
    .select("id, domain, recommendation_type, subject_type, subject_id, title, suggested_priority, status, created_at, supersedes_recommendation_id")
    .eq("domain", domain)
    .order("created_at", { ascending: false });

  if (supersededIds.length > 0) {
    query = query.not("id", "in", `(${supersededIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[decisionEngine:getDecisions:error]", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    domain: r.domain as string,
    recommendationType: r.recommendation_type as string,
    subjectType: r.subject_type as string,
    subjectId: r.subject_id as string,
    title: r.title as string,
    suggestedPriority: r.suggested_priority as string,
    status: r.status as string,
    createdAt: r.created_at as string,
    supersedesRecommendationId: (r.supersedes_recommendation_id as string | null) ?? null,
  }));
}

export interface DecisionEvidenceItem {
  id: string;
  referenceKind: string;
  fact: {
    id: string;
    factType: string;
    occurredAt: string;
    payload: Record<string, unknown>;
    provenanceSourceSystem: string;
    provenanceConfidence: string;
  } | null;
}

export interface DecisionDetail {
  id: string;
  domain: string;
  recommendationType: string;
  subjectType: string;
  subjectId: string;
  title: string;
  description: string;
  suggestedPriority: string;
  status: string;
  createdAt: string;
  supersedesRecommendationId: string | null;
  ruleVersion: {
    id: string;
    version: number;
    logicReference: string;
    policyReferences: unknown;
    authorityReferences: unknown;
  } | null;
  explanation: {
    whatHappened: string;
    whyFlagged: string;
    narrativeSummary: string;
    narrativeRecommendedConsideration: string;
  } | null;
  evidence: DecisionEvidenceItem[];
}

export async function getDecisionById(id: string): Promise<DecisionDetail | null> {
  const supabase = createServerClient();

  const { data: recommendation, error: recommendationError } = await supabase
    .from("intelligence_recommendations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (recommendationError || !recommendation) {
    if (recommendationError) console.error("[decisionEngine:getDecisionById:error]", recommendationError.message);
    return null;
  }

  const [{ data: ruleVersion }, { data: explanation }, { data: evidenceRows }] = await Promise.all([
    supabase
      .from("intelligence_rule_versions")
      .select("id, version, logic_reference, policy_references, authority_references")
      .eq("id", recommendation.rule_version_id)
      .maybeSingle(),
    supabase
      .from("intelligence_explanations")
      .select("deterministic_what_happened, deterministic_why_flagged, narrative_summary, narrative_recommended_consideration")
      .eq("recommendation_id", id)
      .maybeSingle(),
    supabase
      .from("intelligence_evidence")
      .select("id, reference_kind, reference_fact_id")
      .in("signal_id", (recommendation.signal_ids as string[] | null) ?? []),
  ]);

  const factIds = (evidenceRows ?? [])
    .map((e) => e.reference_fact_id as string | null)
    .filter((v): v is string => Boolean(v));

  const { data: facts } =
    factIds.length > 0
      ? await supabase
          .from("intelligence_historical_facts")
          .select("id, fact_type, occurred_at, payload, provenance_source_system, provenance_confidence")
          .in("id", factIds)
      : { data: [] as never[] };

  const factsById = new Map((facts ?? []).map((f) => [f.id as string, f]));

  return {
    id: recommendation.id,
    domain: recommendation.domain,
    recommendationType: recommendation.recommendation_type,
    subjectType: recommendation.subject_type,
    subjectId: recommendation.subject_id,
    title: recommendation.title,
    description: recommendation.description,
    suggestedPriority: recommendation.suggested_priority,
    status: recommendation.status,
    createdAt: recommendation.created_at,
    supersedesRecommendationId: recommendation.supersedes_recommendation_id ?? null,
    ruleVersion: ruleVersion
      ? {
          id: ruleVersion.id as string,
          version: ruleVersion.version as number,
          logicReference: ruleVersion.logic_reference as string,
          policyReferences: ruleVersion.policy_references,
          authorityReferences: ruleVersion.authority_references,
        }
      : null,
    explanation: explanation
      ? {
          whatHappened: explanation.deterministic_what_happened as string,
          whyFlagged: explanation.deterministic_why_flagged as string,
          narrativeSummary: explanation.narrative_summary as string,
          narrativeRecommendedConsideration: explanation.narrative_recommended_consideration as string,
        }
      : null,
    evidence: (evidenceRows ?? []).map((e) => {
      const factId = e.reference_fact_id as string | null;
      const fact = factId ? factsById.get(factId) : null;
      return {
        id: e.id as string,
        referenceKind: e.reference_kind as string,
        fact: fact
          ? {
              id: fact.id as string,
              factType: fact.fact_type as string,
              occurredAt: fact.occurred_at as string,
              payload: (fact.payload as Record<string, unknown>) ?? {},
              provenanceSourceSystem: fact.provenance_source_system as string,
              provenanceConfidence: fact.provenance_confidence as string,
            }
          : null,
      };
    }),
  };
}
