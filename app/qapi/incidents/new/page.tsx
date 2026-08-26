import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canCreateIncidentOrInfection } from "@/lib/compliance/permissions";
import { listWorkforceMembers } from "@/lib/data/workforceMembers";
import { CreateIncidentForm } from "@/components/incidents/CreateIncidentForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewIncidentPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canCreateIncidentOrInfection(profile?.role ?? null)) {
    return (
      <PageContainer title="New Incident">
        <p className="font-sans text-sm text-muted">You do not have permission to create an incident.</p>
      </PageContainer>
    );
  }

  // Prefetched server-side and handed to the client form as plain props —
  // the reasonably-sized workforce roster this codebase already has, never
  // a new client-side search system, and the browser never touches
  // lib/data directly.
  const workforceMembers = await listWorkforceMembers();
  const workforceOptions = workforceMembers
    .map((m) => ({ id: m.id, displayName: m.display_name }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <PageContainer title="New Incident">
      <div className="mb-6">
        <Link href="/qapi/incidents" className="font-sans text-sm text-navy hover:text-navy-light">
          ← Incidents
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-light text-body">New Incident</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Record what happened. Formal review and follow-up decisions happen separately, after this is saved.
        </p>
      </div>

      <CreateIncidentForm workforceOptions={workforceOptions} />
    </PageContainer>
  );
}
