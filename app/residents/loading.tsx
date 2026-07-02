import { PageContainer } from "@/components/PageContainer";

export default function ResidentsLoading() {
  return (
    <PageContainer title="Residents">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <div className="h-9 w-36 rounded-md bg-ivory-warm" />
          <div className="mt-3 h-4 w-80 rounded-md bg-ivory-warm" />
        </div>
        <div className="h-4 w-20 rounded-md bg-ivory-warm" />
      </div>

      <div className="mb-4 flex gap-2 border-b border-ivory-border pb-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-5 w-24 rounded-md bg-ivory-warm" />
        ))}
      </div>

      <div className="rounded-xl border border-ivory-border bg-white shadow-card">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-start gap-6 border-b border-ivory-border px-6 py-5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-3 h-4 w-48 rounded-md bg-ivory-warm" />
              <div className="h-5 w-64 rounded-md bg-ivory-warm" />
              <div className="mt-2 h-3 w-40 rounded-md bg-ivory-warm" />
            </div>
            <div className="h-12 w-48 rounded-md bg-ivory-warm" />
            <div className="h-9 w-24 rounded-md bg-ivory-warm" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
