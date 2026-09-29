"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

async function resolveReportCorrectionActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const admin_note = String(formData.get("admin_note") ?? "").trim() || null;
  if (!id) redirect("/admin/laporan");

  const supabase = await createClient();
  const { error } = await supabase
    .from("report_corrections")
    .update({ status: "resolved", admin_note, resolved_by: session.user.id, resolved_at: new Date().toISOString() })
    .eq("id", id);

  if (error) redirect(`/admin/laporan?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/laporan");
  redirect("/admin/laporan");
}

export const resolveReportCorrectionAction = safeAction(
  resolveReportCorrectionActionImpl,
  "Koreksi ditandai selesai"
);
