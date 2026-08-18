"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getSiteOrigin } from "@/lib/site-url";
import { DAYS } from "@/lib/days";

const TOKEN_HOURS = 48;

function fail(message: string): never {
  redirect(`/pelatih/pengganti?error=${encodeURIComponent(message)}`);
}

export async function requestSubstitutionAction(formData: FormData) {
  const session = await requirePelatih();

  const slot_id = String(formData.get("slot_id") ?? "");
  const session_date = String(formData.get("session_date") ?? "");

  if (!slot_id || !session_date) {
    fail("Slot dan tanggal wajib dipilih.");
  }

  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("class_slots")
    .select(
      "id, pelatih_id, label, day_of_week, start_time, programs:program_id(name)"
    )
    .eq("id", slot_id)
    .single();

  if (!slot) {
    fail("Slot jadwal tidak ditemukan.");
  }

  if (slot.pelatih_id === session.user.id) {
    fail("Ini slot Anda sendiri — Anda sudah punya aksesnya.");
  }

  // One live request per slot+date. Re-requesting while one is already
  // pending or approved would send duplicate WhatsApps to the same people.
  const { data: existing } = await supabase
    .from("substitution_requests")
    .select("id, status")
    .eq("slot_id", slot_id)
    .eq("session_date", session_date)
    .eq("requester_id", session.user.id)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (existing) {
    fail(
      existing.status === "approved"
        ? "Anda sudah punya akses untuk sesi ini."
        : "Permintaan untuk sesi ini sudah diajukan dan menunggu persetujuan."
    );
  }

  const token = randomBytes(24).toString("hex");
  const tokenExpiresAt = new Date(
    Date.now() + TOKEN_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase.from("substitution_requests").insert({
    slot_id,
    requester_id: session.user.id,
    session_date,
    approval_token: token,
    token_expires_at: tokenExpiresAt,
  });

  if (error) {
    fail(error.message);
  }

  // users SELECT is own-profile-only, so the replaced pengajar's phone is
  // unreadable as this pengajar — read it with the service client instead.
  const admin = createAdminClient();
  const [{ data: replaced }, { data: adminPhone }] = await Promise.all([
    admin
      .from("users")
      .select("full_name, phone")
      .eq("id", slot.pelatih_id)
      .single(),
    admin
      .from("site_settings")
      .select("value")
      .eq("key", "phone")
      .maybeSingle(),
  ]);

  const program = slot.programs as unknown as { name: string } | null;
  const origin = await getSiteOrigin();
  const message =
    `${session.fullName ?? "Seorang pengajar"} mengajukan akses sebagai pengajar pengganti.\n\n` +
    `Sesi: ${DAYS[slot.day_of_week]}, ${session_date} pukul ${String(
      slot.start_time
    ).slice(0, 5)}\n` +
    `Kelas: ${program?.name ?? "-"}${slot.label ? ` (${slot.label})` : ""}\n` +
    `Menggantikan: ${replaced?.full_name ?? "-"}\n\n` +
    `Setujui di sini:\n${origin}/persetujuan/${token}\n\n` +
    `Link berlaku ${TOKEN_HOURS} jam. Akses baru aktif setelah disetujui.`;

  await sendWhatsApp(replaced?.phone, message);
  await sendWhatsApp(adminPhone?.value, message);

  revalidatePath("/pelatih/pengganti");
  redirect("/pelatih/pengganti?diajukan=1");
}
