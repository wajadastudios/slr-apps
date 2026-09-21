"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getSiteOrigin } from "@/lib/site-url";
import { loadAdminData } from "@/lib/admin/load";
import { missingReports } from "@/lib/admin/queue";
import { formatDate } from "@/lib/admin/format";

const TO = "/admin/laporan/pengingat";

function fail(message: string): never {
  redirect(`${TO}?error=${encodeURIComponent(message)}`);
}

// Real WhatsApp reminders (Fonnte) to the coaches who still owe reports. The
// list of what is missing is recomputed here, never trusted from the form, and
// only deliveries that Fonnte accepted are counted as sent.
async function sendReportRemindersImpl(formData: FormData) {
  const session = await requireAdmin();
  const chosen = new Set(formData.getAll("pelatih_ids").map(String).filter(Boolean));
  if (chosen.size === 0) fail("Pilih pengajar yang akan diingatkan.");

  const supabase = await createClient();
  const data = await loadAdminData(supabase);
  const missing = missingReports(
    data.schedules,
    data.slotById,
    data.enrollments,
    data.reports,
    data.studentNames,
    data.todayISO,
    data.nowMinutes
  );

  const { data: coaches } = await supabase.from("users").select("id, full_name, phone").in("id", [...chosen]);
  const origin = await getSiteOrigin();

  let sent = 0;
  const failed: string[] = [];
  for (const coach of coaches ?? []) {
    const items = missing.filter((m) => m.pelatih_id === coach.id);
    if (items.length === 0) continue;
    if (!coach.phone) {
      failed.push(`${coach.full_name} (belum ada nomor WhatsApp)`);
      continue;
    }
    const lines = items.slice(0, 10).map((m) => `• ${m.studentName} — ${m.programName}, ${formatDate(m.date)}`);
    const more = items.length > 10 ? `\n…dan ${items.length - 10} sesi lainnya` : "";
    const ok = await sendWhatsApp(
      coach.phone,
      `Halo ${coach.full_name.split(" ")[0]}, ada ${items.length} laporan sesi yang belum diisi:\n${lines.join("\n")}${more}\n\nMohon dilengkapi: ${origin}/pelatih`
    );
    if (!ok) {
      failed.push(`${coach.full_name} (pesan tidak terkirim)`);
      continue;
    }
    sent += 1;
    await supabase.from("activity_log").insert({
      entity_type: "reminder",
      entity_id: coach.id,
      action: "note",
      note: `Pengingat ${items.length} laporan dikirim ke ${coach.full_name}`,
      actor_id: session.user.id,
    });
  }

  revalidatePath(TO);
  if (sent === 0) fail(failed.length ? `Pengingat belum terkirim: ${failed.join("; ")}.` : "Tidak ada laporan yang perlu diingatkan.");
  if (failed.length > 0) fail(`${sent} pengingat terkirim. Belum terkirim: ${failed.join("; ")}.`);
  redirect(TO);
}

export const sendReportRemindersAction = safeAction(sendReportRemindersImpl, "Pengingat laporan terkirim");
