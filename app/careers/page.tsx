import { redirect } from "next/navigation";

export default function CareersPage() {
  redirect("/get-started?mode=careers");
}
