import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import { PageContainer } from "@/components/PageContainer";
import { ProspectInbox } from "@/components/prospects/ProspectInbox";

export default async function ProspectsPage() {
  const community = await getCommunityMetrics();
  const prospects = community.prospects;

  return (
    <PageContainer title="Prospects">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-navy">Prospects</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Website inquiries and new care requests
          </p>
        </div>
        <span className="font-sans text-sm text-muted">
          {prospects.length} {prospects.length === 1 ? "record" : "records"}
        </span>
      </div>

      {community.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load live prospects. Showing demo records only.
        </div>
      )}

      {!community.error && prospects.length === 0 && (
        <div className="rounded-xl border border-ivory-border bg-white px-8 py-16 text-center shadow-card">
          <p className="font-serif text-xl text-muted">No prospects yet</p>
          <p className="mt-2 font-sans text-sm text-muted">
            Submissions from the intake form will appear here.
          </p>
        </div>
      )}

      {prospects.length > 0 && <ProspectInbox prospects={prospects} />}
    </PageContainer>
  );
}
