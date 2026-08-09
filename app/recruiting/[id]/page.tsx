import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { getRecruitingLeadById } from "@/lib/data/recruitingLeads";
import { getCollectorRunsForLead, getObservationsForLead } from "@/lib/data/recruitingLeadCollector";
import {
  getInferencesForLead,
  getHumanConfirmationsForLead,
  getVendorIdentitiesForLead,
} from "@/lib/data/recruitingLeadEvidence";
import { RecruitingStatusBadge } from "@/components/recruiting/RecruitingStatusBadge";
import { OperationalBriefCard } from "@/components/recruiting/OperationalBriefCard";
import { OperationalUnderstandingCard, type WhyReference } from "@/components/recruiting/OperationalUnderstandingCard";
import { InferredSignalsPanel } from "@/components/recruiting/InferredSignalsPanel";
import { HumanConfirmationsPanel } from "@/components/recruiting/HumanConfirmationsPanel";
import { VendorEvidencePanel } from "@/components/recruiting/VendorEvidencePanel";
import { VendorIdentityPanel } from "@/components/recruiting/VendorIdentityPanel";
import { CollectorRunHistory } from "@/components/recruiting/CollectorRunHistory";
import { evaluateRecruitingLifecycle } from "@/lib/recruiting/operationalUnderstanding/evaluateRecruitingLifecycle";
import { generateRecommendations, selectNextRecommendedAction } from "@/lib/recruiting/operationalUnderstanding/generateRecommendations";
import { generateOperationalUnderstandingNarrative } from "@/lib/recruiting/operationalUnderstanding/generateNarrative";
import { generateOperationalBrief } from "@/lib/recruiting/operationalUnderstanding/generateOperationalBrief";
import { evaluateWorkforceCapabilities } from "@/lib/recruiting/operationalUnderstanding/capabilities";
import { hasTodaysWorkOrigin } from "@/lib/workspace/originMarker";
import { BackToTodaysWorkLink } from "@/components/workspace/BackToTodaysWorkLink";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecruitingLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const lead = await getRecruitingLeadById(id);

  if (!lead) notFound();

  const [runs, observations, inferences, humanConfirmations, vendorIdentities] = await Promise.all([
    getCollectorRunsForLead(id),
    getObservationsForLead(id),
    getInferencesForLead(id),
    getHumanConfirmationsForLead(id),
    getVendorIdentitiesForLead(id),
  ]);

  // Operational Understanding — recomputed fresh from persisted evidence on
  // every page load, never read from a stale snapshot. See
  // docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md.
  const lifecycleResults = evaluateRecruitingLifecycle({ observations, inferences, humanConfirmations, vendorIdentities });
  const recommendations = generateRecommendations(lifecycleResults);
  const nextRecommendedAction = selectNextRecommendedAction(recommendations);
  const narrative = generateOperationalUnderstandingNarrative(lifecycleResults, [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "This candidate");
  const capabilities = evaluateWorkforceCapabilities(lifecycleResults);
  const brief = generateOperationalBrief(lifecycleResults, [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "This candidate", capabilities);

  const supportingObservationIds = new Set(lifecycleResults.flatMap((r) => r.supportingObservationIds));
  const why: WhyReference[] = observations
    .filter((o) => supportingObservationIds.has(o.id))
    .map((o) => ({ label: o.observation_key, observedAt: o.observed_at, sourceSystem: o.source_system ?? "apploi" }));
  const sourceFreshness = observations.map((o) => o.observed_at).sort().at(-1) ?? null;

  const latestApploiRun = runs.find((r) => r.source_system === "apploi") ?? null;
  const latestViventiumRun = runs.find((r) => r.source_system === "viventium") ?? null;
  const apploiObservations = observations.filter((o) => o.collector_run_id === latestApploiRun?.id);
  const viventiumObservations = observations.filter((o) => o.collector_run_id === latestViventiumRun?.id);

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead";

  return (
    <PageContainer title={name}>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/recruiting"
          className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
        >
          ← Back to Recruiting
        </Link>
        {hasTodaysWorkOrigin(from) && <BackToTodaysWorkLink />}
      </div>

      <div className="mb-8">
        <h1 className="font-serif text-page-title font-light text-body">{name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge tone="gold">{lead.role_interest === "caregiver" ? "Caregiver" : "Managing Director"}</Badge>
          <div className="flex items-center gap-1.5">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-subtle">
              Serve OS status
            </span>
            <RecruitingStatusBadge status={lead.status} />
          </div>
        </div>
        <p className="mt-2 font-sans text-xs text-subtle">
          The Serve OS status above is set manually via Recruiting Pipeline actions — it is never changed by vendor
          evidence collection.
        </p>
      </div>

      <div className="space-y-6">
        <OperationalBriefCard brief={brief} />

        <details className="group rounded-xl border border-ivory-border bg-surface open:pb-2 open:shadow-card">
          <summary className="cursor-pointer select-none px-6 py-4 font-sans text-sm font-medium text-navy hover:text-navy-light">
            Show detailed desired-state evaluations, evidence, and provenance
          </summary>
          <div className="space-y-6 px-6 pt-2">
            <OperationalUnderstandingCard
              narrative={narrative}
              results={lifecycleResults}
              capabilities={capabilities}
              nextRecommendedAction={nextRecommendedAction}
              why={why}
              sourceFreshness={sourceFreshness}
            />
            <VendorIdentityPanel identities={vendorIdentities} />
            <VendorEvidencePanel source="apploi" latestRun={latestApploiRun} observations={apploiObservations} />
            <VendorEvidencePanel source="viventium" latestRun={latestViventiumRun} observations={viventiumObservations} />
            <InferredSignalsPanel inferences={inferences.map((i) => ({
              signalKey: i.signal_key,
              explanation: i.explanation,
              strength: i.strength,
              unresolvedAlternatives: i.unresolved_alternatives,
              evidenceNeededToResolve: i.evidence_needed_to_resolve,
              computedAt: i.computed_at,
            }))} />
            <HumanConfirmationsPanel confirmations={humanConfirmations} />
            <CollectorRunHistory runs={runs} />
          </div>
        </details>
      </div>
    </PageContainer>
  );
}
