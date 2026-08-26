import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canCreateIncidentOrInfection } from "@/lib/compliance/permissions";
import { CreateInfectionForm } from "@/components/infections/CreateInfectionForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewInfectionPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canCreateIncidentOrInfection(profile?.role ?? null)) {
    return (
      <PageContainer title="New Infection">
        <p className="font-sans text-sm text-muted">You do not have permission to create an infection record.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="New Infection">
      <div className="mb-6">
        <Link href="/qapi/infections" className="font-sans text-sm text-navy hover:text-navy-light">
          ← Infections
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-light text-body">New Infection</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Record what was disclosed. Formal review and follow-up decisions happen separately, after this is saved.
        </p>
      </div>

      <CreateInfectionForm />
    </PageContainer>
  );
}
