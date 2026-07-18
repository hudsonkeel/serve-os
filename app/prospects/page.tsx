import { redirect } from "next/navigation";

// Retired (Scope J, Production Intake Unification) — this workspace read
// the legacy `prospects` table, which is no longer written to by any
// active intake path. Prospect work now happens in Relationships; raw
// intake review happens in the Intake Queue. `prospects` itself remains
// temporarily (see docs/decisions) but this route is no longer wired to it.
export default function ProspectsPage() {
  redirect("/relationships/intake");
}
