import { createServerClient } from "@/lib/supabase/server";
import { Prospect } from "@/lib/supabase/types";
import { COMMUNITY, DEMO_PROSPECTS } from "@/lib/demo/communityData";
import { PageContainer } from "@/components/PageContainer";
import { ResidentsInbox } from "@/components/residents/ResidentsInbox";

export default async function ResidentsPage() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false });

  const realProspects: Prospect[] = data ?? [];

  // Merge real Supabase records with demo data; real records take precedence.
  const realIds = new Set(realProspects.map((p) => p.id));
  const demoOnly = DEMO_PROSPECTS.filter((p) => !realIds.has(p.id));
  const allProspects = [...realProspects, ...demoOnly].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <PageContainer title="Residents">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-navy">Residents</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Watermere at Frisco · every resident, every stage of the relationship
          </p>
        </div>
        <span className="font-sans text-sm text-muted">
          {COMMUNITY.totalResidents} residents
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load residents. Please refresh the page.
        </div>
      )}

      <ResidentsInbox prospects={allProspects} />
    </PageContainer>
  );
}
