import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { getDecisionById } from "@/lib/data/decisionEngine";
import { getMissingEvidenceGuidance } from "@/lib/intelligence/domains/compliance/backgroundEligibility/missingEvidenceGuidance";
import type { ClassificationResult } from "@/lib/intelligence/domains/compliance/backgroundEligibility/classificationEngine";
import type { EvidenceRetrievalMethod } from "@/lib/intelligence/domains/compliance/backgroundEligibility/sourceCapability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIORITY_TONE: Record<string, BadgeTone> = {
  routine: "neutral",
  monitor: "blue",
  important: "warning",
  urgent: "danger",
};

const RETRIEVAL_METHOD_LABEL: Record<EvidenceRetrievalMethod, string> = {
  live_api: "Live API",
  file_import: "File Import",
  manual_verification: "Manual Verification",
  fixture_demonstration: "Fixture / Demonstration",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h2 className="mb-3 font-serif text-card-title font-light text-body">{title}</h2>
      {children}
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function GovernanceDecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decision = await getDecisionById(id);
  if (!decision) notFound();

  const firstFact = decision.evidence.find((e) => e.fact)?.fact ?? null;
  const payload = firstFact?.payload ?? {};
  const reportReceived = Boolean(payload.reportReceived);
  const unrecognizedOffenses = Array.isArray(payload.unrecognizedOffenses)
    ? (payload.unrecognizedOffenses as string[])
    : null;
  const classificationResult: ClassificationResult | null = unrecognizedOffenses
    ? { outcome: "escalate_normalization_failure", unrecognizedOffenses }
    : null;
  const missingEvidence = getMissingEvidenceGuidance({ reportReceived, classificationResult });

  const retrieval = (payload.retrieval as Record<string, unknown> | undefined) ?? null;
  const retrievalMethod = retrieval?.retrievalMethod as EvidenceRetrievalMethod | undefined;
  const verifiedAt = retrieval?.verifiedAt as string | null | undefined;

  const policyReferences = Array.isArray(decision.ruleVersion?.policyReferences)
    ? (decision.ruleVersion!.policyReferences as Array<Record<string, string>>)
    : [];
  const authorityReferences = Array.isArray(decision.ruleVersion?.authorityReferences)
    ? (decision.ruleVersion!.authorityReferences as Array<Record<string, string>>)
    : [];

  return (
    <PageContainer title={`${decision.subjectType} — ${decision.subjectId}`}>
      <div className="mb-6">
        <Link href="/governance" className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy hover:text-navy-light">
          ← Back to Governance
        </Link>
      </div>

      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">{decision.title}</h1>
          <p className="mt-1 font-sans text-base text-muted">
            {decision.subjectType} — {decision.subjectId} · evaluated {formatDateTime(decision.createdAt)}. Point-in-time
            evaluation over recorded evidence — not a continuously monitored feed.
          </p>
        </div>
        <Badge tone={PRIORITY_TONE[decision.suggestedPriority] ?? "neutral"}>{decision.suggestedPriority}</Badge>
      </div>

      {decision.supersedesRecommendationId && (
        <div className="mb-6">
          <Link
            href={`/governance/${decision.supersedesRecommendationId}`}
            className="font-sans text-sm text-navy hover:text-navy-light"
          >
            This decision supersedes a prior decision for the same subject and rule version →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Explanation">
          {decision.explanation ? (
            <div className="space-y-4 font-sans text-sm">
              <div>
                <p className="font-medium uppercase tracking-wide text-muted">Deterministic basis</p>
                <p className="mt-1 text-body">{decision.explanation.whatHappened}</p>
                <p className="mt-1 text-body">{decision.explanation.whyFlagged}</p>
                {decision.ruleVersion && (
                  <p className="mt-1 text-muted">
                    Rule: {decision.ruleVersion.logicReference} (v{decision.ruleVersion.version})
                  </p>
                )}
              </div>
              <div>
                <p className="font-medium uppercase tracking-wide text-muted">Narrative</p>
                <p className="mt-1 text-body">{decision.explanation.narrativeSummary}</p>
                <p className="mt-1 text-body">{decision.explanation.narrativeRecommendedConsideration}</p>
              </div>
            </div>
          ) : (
            <p className="font-sans text-sm text-muted">No explanation recorded.</p>
          )}
        </Card>

        <Card title="Recommendation">
          <p className="font-sans text-sm text-body">{decision.description}</p>
          <p className="mt-2 font-sans text-xs text-muted">
            Advisory only — never automatically approves, rejects, or changes any external system. Human review
            required.
          </p>
        </Card>

        <Card title="Evidence considered">
          {decision.evidence.length === 0 ? (
            <p className="font-sans text-sm text-muted">No evidence recorded.</p>
          ) : (
            <ul className="space-y-3 font-sans text-sm">
              {decision.evidence.map((item) => (
                <li key={item.id} className="border-b border-ivory-border pb-3 last:border-0 last:pb-0">
                  <p className="text-body">{item.fact?.factType ?? item.referenceKind}</p>
                  {item.fact && (
                    <>
                      <p className="mt-1 text-muted">Recorded {formatDateTime(item.fact.occurredAt)}</p>
                      <p className="mt-1 text-muted">
                        Provenance: {item.fact.provenanceSourceSystem} ({item.fact.provenanceConfidence})
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {retrievalMethod && (
            <div className="mt-4 border-t border-ivory-border pt-4">
              <Badge tone="blue">{RETRIEVAL_METHOD_LABEL[retrievalMethod] ?? retrievalMethod}</Badge>
              <p className="mt-2 font-sans text-xs text-muted">
                {verifiedAt ? `Last verified ${formatDateTime(verifiedAt)}.` : "Not yet verified by a human."} This
                decision is never continuously monitored — it reflects evidence recorded as of the date above.
              </p>
            </div>
          )}
        </Card>

        <Card title="Missing or unresolved evidence">
          {missingEvidence.length === 0 ? (
            <p className="font-sans text-sm text-muted">Nothing outstanding for this decision.</p>
          ) : (
            <ul className="space-y-4 font-sans text-sm">
              {missingEvidence.map((item, index) => (
                <li key={index}>
                  <p className="text-body">{item.what}</p>
                  <p className="mt-1 text-muted">{item.why}</p>
                  <p className="mt-1 text-muted">Expected source: {item.expectedSource}</p>
                  <p className="mt-1 text-muted">Owner: {item.owner}</p>
                  <p className="mt-1 text-muted">How to resolve: {item.howToResolve}</p>
                  <p className="mt-1 text-muted">
                    Blocks decision: {item.blocksDecision ? "Yes" : "No"} · Risk: {item.risk}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Policy references">
          {policyReferences.length === 0 ? (
            <p className="font-sans text-sm text-muted">None recorded.</p>
          ) : (
            <ul className="space-y-2 font-sans text-sm">
              {policyReferences.map((ref, index) => (
                <li key={index} className="text-body">
                  <span className="font-mono text-xs text-muted">{ref.documentPath}</span>
                  {ref.sectionId ? ` — ${ref.sectionId}` : ""} {ref.sectionTitle ?? ""}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Authority references">
          {authorityReferences.length === 0 ? (
            <p className="font-sans text-sm text-muted">
              None recorded — this module has not completed legal review of any external regulatory citation (see
              decision-log.md&apos;s &quot;Requires Legal Review&quot; flags).
            </p>
          ) : (
            <ul className="space-y-2 font-sans text-sm text-body">
              {authorityReferences.map((ref, index) => (
                <li key={index}>{JSON.stringify(ref)}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
