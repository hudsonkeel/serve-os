// Data layer for the Deterministically Inferred and Human Confirmed
// evidence classes, plus vendor identity resolution — see
// docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md Phase 4/5.
// Relative imports with explicit .ts extensions, matching every other
// script-callable data-layer file in lib/data/.
//
// Nothing in this file ever writes to recruiting_leads.status.
import { createServerClient } from "../supabase/server.ts";
import type {
  CollectorSourceSystem,
  InferenceStrength,
  RecruitingLeadHumanConfirmation,
  RecruitingLeadInference,
  RecruitingLeadRule,
  RecruitingLeadRuleVersion,
  RecruitingLeadVendorIdentity,
  RuleTriggerType,
  VendorIdentityMatchConfidence,
  VendorIdentityMatchMethod,
} from "../supabase/types.ts";

// ─── Rules / Rule Versions ─────────────────────────────────────────────────
// Idempotent seeding — a rule proposal (docs' Phase 5/6) is written once,
// as data, and every subsequent call just resolves the existing row. This
// mirrors the platform's Rule/RuleVersion immutability discipline: a
// changed threshold or changed logic is a NEW version, never an edit to
// an existing row's parameters/logicReference.
export async function ensureRuleVersion(input: {
  slug: string;
  title: string;
  description: string;
  version: number;
  triggerType: RuleTriggerType;
  parameters: Record<string, unknown>;
  logicReference: string;
  changelogNote?: string | null;
}): Promise<{ ruleVersionId?: string; error?: string }> {
  const supabase = createServerClient();

  const { data: existingRule } = await supabase
    .from("recruiting_lead_rules")
    .select("*")
    .eq("slug", input.slug)
    .maybeSingle();

  let rule = existingRule as RecruitingLeadRule | null;

  if (!rule) {
    const { data: createdRule, error: createRuleError } = await supabase
      .from("recruiting_lead_rules")
      .insert({ domain: "recruiting", slug: input.slug, title: input.title, description: input.description })
      .select("*")
      .single();
    if (createRuleError || !createdRule) {
      return { error: `Could not create rule ${input.slug}: ${createRuleError?.message}` };
    }
    rule = createdRule as RecruitingLeadRule;
  }

  const { data: existingVersion } = await supabase
    .from("recruiting_lead_rule_versions")
    .select("*")
    .eq("rule_id", rule.id)
    .eq("version", input.version)
    .maybeSingle();

  if (existingVersion) {
    return { ruleVersionId: (existingVersion as RecruitingLeadRuleVersion).id };
  }

  const { data: createdVersion, error: createVersionError } = await supabase
    .from("recruiting_lead_rule_versions")
    .insert({
      rule_id: rule.id,
      version: input.version,
      trigger_type: input.triggerType,
      parameters: input.parameters,
      logic_reference: input.logicReference,
      changelog_note: input.changelogNote ?? null,
    })
    .select("*")
    .single();

  if (createVersionError || !createdVersion) {
    return { error: `Could not create rule version ${input.slug}@${input.version}: ${createVersionError?.message}` };
  }

  return { ruleVersionId: (createdVersion as RecruitingLeadRuleVersion).id };
}

// ─── Inferences (Deterministically Inferred) ──────────────────────────────
export async function insertInference(input: {
  recruitingLeadId: string;
  ruleVersionId: string;
  signalKey: string;
  explanation: string;
  strength: InferenceStrength;
  unresolvedAlternatives: readonly string[];
  evidenceNeededToResolve: readonly string[];
  supportingObservationIds: readonly string[];
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { data: inference, error } = await supabase
    .from("recruiting_lead_inferences")
    .insert({
      recruiting_lead_id: input.recruitingLeadId,
      rule_version_id: input.ruleVersionId,
      signal_key: input.signalKey,
      explanation: input.explanation,
      strength: input.strength,
      unresolved_alternatives: input.unresolvedAlternatives,
      evidence_needed_to_resolve: input.evidenceNeededToResolve,
    })
    .select("id")
    .single();

  if (error || !inference) {
    return { error: `Could not persist inference ${input.signalKey}: ${error?.message}` };
  }

  if (input.supportingObservationIds.length > 0) {
    const { error: evidenceError } = await supabase.from("recruiting_lead_inference_evidence").insert(
      input.supportingObservationIds.map((observationId) => ({
        inference_id: inference.id as string,
        observation_id: observationId,
      }))
    );
    if (evidenceError) {
      return { error: `Could not link supporting evidence for ${input.signalKey}: ${evidenceError.message}` };
    }
  }

  return {};
}

export interface InferenceWithEvidence extends RecruitingLeadInference {
  supportingObservationIds: string[];
}

export async function getInferencesForLead(recruitingLeadId: string): Promise<InferenceWithEvidence[]> {
  const supabase = createServerClient();

  const { data: inferences, error } = await supabase
    .from("recruiting_lead_inferences")
    .select("*")
    .eq("recruiting_lead_id", recruitingLeadId)
    .order("computed_at", { ascending: false });

  if (error) {
    console.error("[getInferencesForLead]", { recruitingLeadId, message: error.message });
    return [];
  }

  const rows = (inferences as RecruitingLeadInference[] | null) ?? [];
  if (rows.length === 0) return [];

  const { data: evidenceLinks } = await supabase
    .from("recruiting_lead_inference_evidence")
    .select("inference_id, observation_id")
    .in(
      "inference_id",
      rows.map((r) => r.id)
    );

  return rows.map((r) => ({
    ...r,
    supportingObservationIds: (evidenceLinks ?? [])
      .filter((l) => l.inference_id === r.id)
      .map((l) => l.observation_id as string),
  }));
}

// ─── Human Confirmations ───────────────────────────────────────────────────
// rationale is required by the DB constraint — a confirmation with no
// stated source cannot be created at all, regardless of caller behavior.
export async function insertHumanConfirmation(input: {
  recruitingLeadId: string;
  confirmationKey: string;
  confirmedValue: string;
  rationale: string;
  actor: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.from("recruiting_lead_human_confirmations").insert({
    recruiting_lead_id: input.recruitingLeadId,
    confirmation_key: input.confirmationKey,
    confirmed_value: input.confirmedValue,
    rationale: input.rationale,
    actor: input.actor,
  });

  if (error) {
    return { error: `Could not persist human confirmation: ${error.message}` };
  }
  return {};
}

export async function getHumanConfirmationsForLead(
  recruitingLeadId: string
): Promise<RecruitingLeadHumanConfirmation[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_lead_human_confirmations")
    .select("*")
    .eq("recruiting_lead_id", recruitingLeadId)
    .order("confirmed_at", { ascending: false });

  if (error) {
    console.error("[getHumanConfirmationsForLead]", { recruitingLeadId, message: error.message });
    return [];
  }

  return (data as RecruitingLeadHumanConfirmation[] | null) ?? [];
}

// ─── Vendor Identity Resolution (Phase 4's match ladder) ──────────────────
export async function upsertVendorIdentity(input: {
  recruitingLeadId: string;
  sourceSystem: CollectorSourceSystem;
  vendorRecordId: string;
  vendorDisplayName: string | null;
  matchMethod: VendorIdentityMatchMethod;
  matchConfidence: VendorIdentityMatchConfidence;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.from("recruiting_lead_vendor_identities").upsert(
    {
      recruiting_lead_id: input.recruitingLeadId,
      source_system: input.sourceSystem,
      vendor_record_id: input.vendorRecordId,
      vendor_display_name: input.vendorDisplayName,
      match_method: input.matchMethod,
      match_confidence: input.matchConfidence,
    },
    { onConflict: "recruiting_lead_id,source_system" }
  );

  if (error) {
    return { error: `Could not persist vendor identity link: ${error.message}` };
  }
  return {};
}

// The ONLY way is_human_confirmed ever becomes true — always requires a
// named actor, matching the DB's own bidirectional check constraint.
export async function confirmVendorIdentity(input: {
  recruitingLeadId: string;
  sourceSystem: CollectorSourceSystem;
  linkedBy: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("recruiting_lead_vendor_identities")
    .update({ is_human_confirmed: true, linked_by: input.linkedBy, linked_at: new Date().toISOString() })
    .eq("recruiting_lead_id", input.recruitingLeadId)
    .eq("source_system", input.sourceSystem);

  if (error) {
    return { error: `Could not confirm vendor identity link: ${error.message}` };
  }
  return {};
}

export async function getVendorIdentitiesForLead(
  recruitingLeadId: string
): Promise<RecruitingLeadVendorIdentity[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("recruiting_lead_vendor_identities")
    .select("*")
    .eq("recruiting_lead_id", recruitingLeadId);

  if (error) {
    console.error("[getVendorIdentitiesForLead]", { recruitingLeadId, message: error.message });
    return [];
  }

  return (data as RecruitingLeadVendorIdentity[] | null) ?? [];
}
