import Link from "next/link";

export type RelationshipView = "actions" | "whiteboard" | "all";

const VIEWS: { value: RelationshipView; label: string; href: string }[] = [
  { value: "actions", label: "Action Board", href: "/relationships/actions" },
  { value: "whiteboard", label: "Whiteboard", href: "/relationships/whiteboard" },
  { value: "all", label: "All Relationships", href: "/relationships" },
];

// Shared view switcher for the three Relationships surfaces (Part 12).
// /relationships stays the "All Relationships" route — already linked from
// the sidebar and from every "Open Relationship" / resident-page entry
// point — so nothing existing breaks; this just makes the other two views
// reachable and the current one visible.
export function RelationshipViewTabs({ active }: { active: RelationshipView }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-ivory-border">
      {VIEWS.map((view) => {
        const isActive = view.value === active;
        return (
          <Link
            key={view.value}
            href={view.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors ${
              isActive
                ? "border-b-navy text-navy"
                : "border-b-transparent text-muted hover:text-body"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
