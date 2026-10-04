"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

// "Izin — sesi terpakai": the admin decides whether a late-notice izin (the
// family cancelled after the coach had arrived) uses one session of the
// paid package. The database only accepts this from an admin
// (guard_quota_decision, 0046_izin_sesi_terpakai.sql).
async function decideQuotaActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "used" && decision !== "not_used")) redirect("/admin/laporan");

  const supabase = await createClient();
  const { error } = await supabase
    .from("progress_reports")
    .update({ quota_decision: decision, quota_decided_by: session.user.id, quota_decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("attendance", "izin")
    .eq("late_notice", true);
  if (error) redirect(`/admin/laporan?error=${encodeURIComponent("Keputusan belum dapat disimpan.")}`);

  // Quota, billing and payroll all read this decision.
  for (const path of ["/admin", "/admin/laporan", "/admin/tagihan", "/admin/gaji", "/ortu"]) revalidatePath(path);
  redirect("/admin/laporan");
}

export const decideQuotaAction = safeAction(decideQuotaActionImpl, "Keputusan sesi disimpan");
