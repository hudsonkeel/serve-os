import { PageContainer } from "@/components/PageContainer";
import { AddClientForm } from "@/components/residents/AddClientForm";
import { listCommunities } from "@/lib/data/communities";
import { getAddClientDefaultCommunity } from "@/lib/actions/addClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Add New Client phase — a dedicated page (not a modal), matching the
// established Upload/Review convention (e.g. /residents/roster-import/new):
// enough room for the duplicate-review panel and confirmation step
// without fighting a small modal. Community selection/prefill happens
// here (section 1) — a single-community operator context prefills that
// community; "All Communities" requires an explicit choice, never a
// silent default.
export default async function AddClientPage() {
  const [communities, defaultCommunity] = await Promise.all([listCommunities(), getAddClientDefaultCommunity()]);

  return (
    <PageContainer title="The People We Serve · Add New Client">
      <div className="mb-6">
        <h1 className="font-serif text-page-title font-light text-body">Add New Client</h1>
        <p className="mt-1 font-sans text-base text-muted">
          Create a canonical Serve person and establish their Serve relationship. AxisCare is never required to do
          this — a later AxisCare record will link back to this same person automatically.
        </p>
      </div>

      <AddClientForm communities={communities} defaultCommunityId={defaultCommunity.communityId} />
    </PageContainer>
  );
}
