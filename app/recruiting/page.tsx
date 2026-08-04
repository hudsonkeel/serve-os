import { getRecruitingLeads } from "@/lib/data/recruitingLeads";
import { PageContainer } from "@/components/PageContainer";
import { RecruitingInbox } from "@/components/recruiting/RecruitingInbox";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { PEOPLE_WHO_SERVE_CONTEXT } from "@/lib/askServe/areaContexts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecruitingPage() {
  const [{ leads, error }, profile] = await Promise.all([getRecruitingLeads(), getCurrentAuthorizedUser()]);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  return (
    <PageContainer title="The People Who Serve">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-body">Recruiting Leads</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Caregiver and managing director inquiries
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-sans text-sm text-muted">
            {leads.length} {leads.length === 1 ? "record" : "records"}
          </span>
          {askServeEnabled && (
            <AskServeTrigger
              context={buildAskServeContext(PEOPLE_WHO_SERVE_CONTEXT, {
                surface: "candidates_list",
                subjectType: "candidate_collection",
                userRole: profile?.role ?? undefined,
              })}
              label="Ask Serve about our team"
            />
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load recruiting leads.
        </div>
      )}

      {!error && leads.length === 0 && (
        <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
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
