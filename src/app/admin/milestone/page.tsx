import { redirect } from "next/navigation";

// Milestones moved into Admin > Penilaian Program (per program).
export default function MilestoneRedirectPage() {
  redirect("/admin/penilaian?tab=rekor");
}
