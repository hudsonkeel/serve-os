import { redirect } from "next/navigation";

// Preserves existing links/bookmarks to the old route name. "AxisCare
// Clients" was never a real product concept — a real person is a Serve
// Client (see app/clients/page.tsx); AxisCare is the vendor this data is
// sourced from, not the owner of the client relationship.
export default function AxisCareClientsRedirectPage() {
  redirect("/clients");
}
