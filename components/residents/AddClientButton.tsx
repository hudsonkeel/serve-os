import Link from "next/link";

// Add New Client phase — section 26/27: available from every canonical
// partner/community context (Traditional Care and Watermere Community
// Care alike; manual creation is useful everywhere, not just where it's
// urgently needed today). Community selection/prefill itself happens on
// the destination page (section 1), not here — this is just the entry
// point.
export function AddClientButton({ className }: { className?: string }) {
  return (
    <Link
      href="/residents/add-client"
      className={
        className ??
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-navy px-4 font-sans text-button font-medium text-white shadow-card transition-colors hover:bg-navy-light"
      }
    >
      Add New Client
    </Link>
  );
}
