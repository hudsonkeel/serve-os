import { getRecruitingLeads } from "@/lib/data/recruitingLeads";
import { PageContainer } from "@/components/PageContainer";
import { RecruitingInbox } from "@/components/recruiting/RecruitingInbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecruitingPage() {
  const { leads, error } = await getRecruitingLeads();

  return (
    <PageContainer title="Recruiting">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-navy">Recruiting Leads</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Caregiver and managing director inquiries
          </p>
        </div>
        <span className="font-sans text-sm text-muted">
          {leads.length} {leads.length === 1 ? "record" : "records"}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load recruiting leads.
        </div>
      )}

      {!error && leads.length === 0 && (
        <div className="rounded-xl border border-ivory-border bg-white px-8 py-16 text-center shadow-card">
          <p className="font-serif text-xl text-muted">No recruiting leads yet</p>
          <p className="mt-2 font-sans text-sm text-muted">
            Submissions from /get-started will appear here.
          </p>
        </div>
      )}

      {leads.length > 0 && <RecruitingInbox leads={leads} />}
    </PageContainer>
  );
}
