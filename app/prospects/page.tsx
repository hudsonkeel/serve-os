import { getRelationshipBoardRows } from "@/lib/data/relationships";
import { PROSPECT_RELATIONSHIP_TYPES } from "@/lib/relationships/constants";
import { PageContainer } from "@/components/PageContainer";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { ProspectsBoard } from "@/components/prospects/ProspectsBoard";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Prospects — the Serve-facing surface for "who are we potentially
// going to serve." Reuses the existing Relationships CRM engine
// (owner, stage, next action, touches, notes, service opportunity —
// see lib/data/relationships.ts) rather than rebuilding it; this page
// only filters and re-labels that data with Serve/Prospect
// terminology instead of "Relationship." A Serve Prospect may
// originate from a manually created prospect, a website intake, an
// assessment, an existing Resident/External Prospect relationship, or
// (read-only evidence, not yet ingested — see /reconciliation) an
// AxisCare Lead: these are sources of one Prospect concept, never
// separate Serve lifecycle types. "Lead" is AxisCare's own vendor
// terminology for exactly this.
export default async function ProspectsPage() {
  const allRows = await getRelationshipBoardRows();
  const prospectRows = allRows.filter((row) => PROSPECT_RELATIONSHIP_TYPES.includes(row.relationshipType));

  return (
    <PageContainer title="The People We Serve · Prospects">
      <PeopleWeServeTabs active="prospects" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Prospects</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Who Serve may go on to serve, where they are in the process, who owns the relationship, and what
            happens next. Referral partners, active clients, and other non-prospect relationships live in{" "}
            <Link href="/relationships" className="font-medium text-navy hover:text-navy-light">
              Relationships
            </Link>
            .
          </p>
        </div>
        <span className="font-sans text-base font-medium text-muted">{prospectRows.length} prospects</span>
      </div>

      <ProspectsBoard rows={prospectRows} />
    </PageContainer>
  );
}
