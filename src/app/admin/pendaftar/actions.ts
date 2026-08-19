"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, createAccount } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getSiteOrigin } from "@/lib/site-url";

export async function approveRegistrationAction(formData: FormData) {
  await requireAdmin();

  const registration_id = String(formData.get("registration_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();

  if (!registration_id || !email) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent("Data tidak lengkap.")}`
    );
  }

  const supabase = await createClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "child_name, parent_name, parent_phone, program_id, birth_place, birth_date, referral_code, referred_by_pelatih_id, referral_discount_type, referral_discount_value, referral_komisi_per_sesi"
    )
    .eq("id", registration_id)
    .single();

  if (!registration) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent("Pendaftar tidak ditemukan.")}`
    );
  }

  const { error: accountError } = await createAccount("ortu", formData);

  if (accountError) {
    redirect(`/admin/pendaftar?error=${encodeURIComponent(accountError)}`);
  }

  const { data: newUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!newUser) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent("Akun dibuat, tapi siswa gagal ditautkan. Tambahkan manual di halaman Siswa.")}`
    );
  }

  await supabase.from("students").insert({
    full_name: registration!.child_name,
    parent_id: newUser.id,
    program_id: registration!.program_id,
    birth_place: registration!.birth_place,
    birth_date: registration!.birth_date,
    referral_code_used: registration!.referral_code,
    referred_by_pelatih_id: registration!.referred_by_pelatih_id,
    referral_discount_type: registration!.referral_discount_type,
    referral_discount_value: registration!.referral_discount_value,
    referral_komisi_per_sesi: registration!.referral_komisi_per_sesi,
  });

  await supabase
    .from("registrations")
    .update({ status: "approved" })
    .eq("id", registration_id);

  const origin = await getSiteOrigin();
  await sendWhatsApp(
    registration!.parent_phone,
    `Selamat! Pendaftaran ${registration!.child_name} di Sari Les Renang sudah disetujui. Login di ${origin}/login dengan email ${email} dan password yang diberikan admin.`
  );

  revalidatePath("/admin/pendaftar");
  revalidatePath("/admin/orang-tua");
  revalidatePath("/admin/murid");
  redirect("/admin/pendaftar");
}

export async function rejectRegistrationAction(formData: FormData) {
  await requireAdmin();

  const registration_id = String(formData.get("registration_id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("registrations")
    .update({ status: "rejected" })
    .eq("id", registration_id);

  revalidatePath("/admin/pendaftar");
}

export async function scheduleTrialAction(formData: FormData) {
  await requireAdmin();

  const registration_id = String(formData.get("registration_id") ?? "");
  const trial_pelatih_id = String(formData.get("trial_pelatih_id") ?? "");
  const trial_session_date = String(formData.get("trial_session_date") ?? "");
  const trial_session_time = String(formData.get("trial_session_time") ?? "");
  const trial_location = String(formData.get("trial_location") ?? "").trim();

  if (
    !registration_id ||
    !trial_pelatih_id ||
    !trial_session_date ||
    !trial_session_time
  ) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent(
        "Pengajar, tanggal, dan jam trial wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select("child_name, parent_phone")
    .eq("id", registration_id)
    .single();

  if (!registration) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent("Pendaftar tidak ditemukan.")}`
    );
  }

  const { data: pelatih } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", trial_pelatih_id)
    .single();

  // Regenerated on every schedule/reschedule -- an admin editing the
  // trial details always gets a fresh link + a fresh WhatsApp to the
  // parent, rather than silently updating a link they were already sent.
  const payment_token = randomBytes(24).toString("hex");

  const { error } = await supabase
    .from("registrations")
    .update({
      trial_pelatih_id,
      trial_session_date,
      trial_session_time,
      trial_location: trial_location || null,
      payment_token,
    })
    .eq("id", registration_id);

  if (error) {
    redirect(`/admin/pendaftar?error=${encodeURIComponent(error.message)}`);
  }

  const origin = await getSiteOrigin();
  const timeLabel = trial_session_time.slice(0, 5);
  await sendWhatsApp(
    registration!.parent_phone,
    `Halo! Jadwal trial ${registration!.child_name} di Sari Les Renang sudah dikonfirmasi: ${trial_session_date} pukul ${timeLabel}${
      trial_location ? ` di ${trial_location}` : ""
    } bersama Coach ${pelatih?.full_name ?? "-"}. Silakan lakukan pembayaran trial melalui link berikut: ${origin}/trial/${payment_token}`
  );

  revalidatePath("/admin/pendaftar");
  revalidatePath("/pelatih/trial");
  redirect("/admin/pendaftar");
}

export async function markTrialPaidAction(formData: FormData) {
  await requireAdmin();

  const registration_id = String(formData.get("registration_id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("registrations")
    .update({ trial_fee_status: "paid" })
    .eq("id", registration_id);

  revalidatePath("/admin/pendaftar");
}
