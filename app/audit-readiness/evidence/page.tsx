import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { LinkButton } from "@/components/ui/Button";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canViewAuditReadiness } from "@/lib/compliance/permissions";
import { listRecentPersonDocuments } from "@/lib/data/personDocuments";
import type { PersonSubjectType } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The composed, cross-domain Evidence view the spec calls for (Module B) —
// search/review/audit-retrieval only. This page never uploads, replaces,
// or verifies anything itself; every record here is owned and managed by
// its own domain (residents/workforce), reached via the "Open record"
// link. Per the governing principle: compose, don't recreate.
function ownerHref(subjectType: PersonSubjectType, subjectId: string): string | null {
  if (subjectType === "resident") return `/residents/${subjectId}`;
  if (subjectType === "workforce_member") return `/workforce/${subjectId}`;
  return null;
}

function ownerLabel(subjectType: PersonSubjectType): string {
  if (subjectType === "resident") return "Resident";
  if (subjectType === "workforce_member") return "Workforce";
  return subjectType;
}

export default async function AuditReadinessEvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const [{ subject }, profile] = await Promise.all([searchParams, getCurrentAuthorizedUser()]);

  if (!canViewAuditReadiness(profile?.role ?? null)) {
    return (
      <PageContainer title="Evidence">
        <p className="font-sans text-sm text-muted">You do not have permission to view Audit Readiness evidence.</p>
      </PageContainer>
    );
  }

  const documents = await listRecentPersonDocuments(200);
  const filtered = subject ? documents.filter((d) => d.subject_type === subject) : documents;

  const counts = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.subject_type] = (acc[d.subject_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageContainer title="Evidence">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-light text-body">Evidence</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Search and audit-retrieval across every domain&apos;s evidence — each record stays owned by its own
          domain; open it there to manage it.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          href="/audit-readiness/evidence"
          className={`rounded-md border px-3 py-1.5 font-sans text-xs font-medium ${!subject ? "border-navy bg-navy text-white" : "border-ivory-border text-muted hover:border-navy/20"}`}
        >
          All ({documents.length})
        </Link>
        {Object.entries(counts).map(([subjectType, count]) => (
          <Link
            key={subjectType}
            href={`/audit-readiness/evidence?subject=${subjectType}`}
            className={`rounded-md border px-3 py-1.5 font-sans text-xs font-medium ${subject === subjectType ? "border-navy bg-navy text-white" : "border-ivory-border text-muted hover:border-navy/20"}`}
          >
            {ownerLabel(subjectType as PersonSubjectType)} ({count})
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-ivory-border bg-white p-5">
        {filtered.length === 0 ? (
          <p className="font-sans text-sm text-muted">No evidence records found.</p>
        ) : (
          <ul>
            {filtered.map((doc) => {
              const href = ownerHref(doc.subject_type, doc.subject_id);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-4 border-b border-ivory-border py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-medium text-body">{doc.original_filename}</p>
                    <p className="mt-0.5 font-sans text-xs text-muted">
                      {ownerLabel(doc.subject_type)} · {doc.document_type.replace(/_/g, " ")} ·{" "}
                      {new Date(doc.uploaded_at).toLocaleDateString()} · {doc.status}
                    </p>
                  </div>
                  {href && (
                    <LinkButton href={href} size="small">
                      Open record →
                    </LinkButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
