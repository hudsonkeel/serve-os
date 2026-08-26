import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { canCreateIncidentOrInfection, canViewIncidentsAndInfections } from "@/lib/compliance/permissions";
import { listInfections } from "@/lib/data/infections";
import { getResidentsByIds } from "@/lib/data/residents";
import { InfectionRegisterTable, type InfectionRowView } from "@/components/infections/InfectionRegisterTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// disclosed_at is a plain date (no time-of-day meaning) — formatted from
// its own y/m/d components, never through a timezone-aware Date parse
// (new Date("2026-08-26") parses as UTC midnight, which can render as the
// previous calendar day in Central time).
function formatDisclosedDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function InfectionsRegisterPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canViewIncidentsAndInfections(profile?.role ?? null)) {
    return (
      <PageContainer title="Infections">
        <p className="font-sans text-sm text-muted">You do not have permission to view infection records.</p>
      </PageContainer>
    );
  }

  const filter = await resolveCurrentCommunityQueryFilter(profile);
  const infections = await listInfections(filter);

  const residentIds = [...new Set(infections.map((i) => i.resident_id))];
  const residents = await getResidentsByIds(residentIds);
  const residentNameById = new Map(residents.map((r) => [r.id, r.display_name || r.full_name || "Unknown"]));

  const rows: InfectionRowView[] = infections.map((infection) => ({
    id: infection.id,
    residentLabel: residentNameById.get(infection.resident_id) ?? "Unknown client",
    disclosedAtLabel: formatDisclosedDate(infection.disclosed_at),
    conditionSummary: infection.condition_description,
    status: infection.status,
    reviewStatus: infection.review_status,
    followUpRequired: infection.follow_up_required,
    owner: infection.owner,
  }));

  const canCreate = canCreateIncidentOrInfection(profile?.role ?? null);

  return (
    <PageContainer title="Infections">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/qapi" className="font-sans text-sm text-navy hover:text-navy-light">
            ← Quality (QAPI)
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-light text-body">Infections</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            What was disclosed, whether it&apos;s been reviewed, and what&apos;s still open.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/qapi/infections/new"
            className="shrink-0 rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light"
          >
            New Infection
          </Link>
        )}
      </div>

      {infections.length === 0 ? (
        <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
          <p className="font-serif text-xl text-muted">No infection records yet</p>
          {canCreate && (
            <p className="mt-2 font-sans text-sm text-muted">
              <Link href="/qapi/infections/new" className="text-navy hover:text-navy-light">
                Record the first one
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <InfectionRegisterTable rows={rows} />
      )}
    </PageContainer>
  );
}
