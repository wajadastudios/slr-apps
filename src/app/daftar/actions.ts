"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function submitRegistrationAction(formData: FormData) {
  const child_name = String(formData.get("child_name") ?? "").trim();
  const parent_name = String(formData.get("parent_name") ?? "").trim();
  const parent_email = String(formData.get("parent_email") ?? "").trim();
  const parent_phone = String(formData.get("parent_phone") ?? "").trim();
  const birth_place = String(formData.get("birth_place") ?? "").trim();
  const birth_date = String(formData.get("birth_date") ?? "").trim();
  const program_id = String(formData.get("program_id") ?? "");
  const preferred_schedule = String(
    formData.get("preferred_schedule") ?? ""
  ).trim();
  const payment_method = String(formData.get("payment_method") ?? "").trim();
  const referral_code = String(formData.get("referral_code") ?? "")
    .trim()
    .toUpperCase();

  if (
    !child_name ||
    !parent_name ||
    !parent_email ||
    !birth_place ||
    !birth_date ||
    !program_id
  ) {
    redirect(
      `/daftar?error=${encodeURIComponent(
        "Nama anak, nama orang tua, tempat/tanggal lahir, email, dan program wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();

  // Referral terms are snapshotted here, at submission, rather than read
  // live later -- so a code being edited or retired while this
  // registration sits in the approval queue never changes what was
  // already promised to this parent.
  let referredByPelatihId: string | null = null;
  let referralDiscountType: string | null = null;
  let referralDiscountValue: number | null = null;
  let referralKomisiPerSesi: number | null = null;

  if (referral_code) {
    const { data: match } = (await supabase
      .rpc("lookup_referral_code", { p_code: referral_code })
      .maybeSingle()) as {
      data: {
        pelatih_id: string;
        discount_type: string;
        discount_value: number;
        komisi_per_sesi: number;
      } | null;
    };

    if (!match) {
      redirect(
        `/daftar?error=${encodeURIComponent(
          "Kode referral tidak ditemukan. Periksa kembali penulisan kodenya, atau tanyakan ke pengajar yang memberikan kode tersebut."
        )}`
      );
    }

    referredByPelatihId = match.pelatih_id;
    referralDiscountType = match.discount_type;
    referralDiscountValue = match.discount_value;
    referralKomisiPerSesi = match.komisi_per_sesi;
  }

  const { error } = await supabase.from("registrations").insert({
    child_name,
    parent_name,
    parent_email,
    parent_phone: parent_phone || null,
    birth_place,
    birth_date,
    program_id,
    preferred_schedule: preferred_schedule || null,
    payment_method: payment_method || null,
    referral_code: referral_code || null,
    referred_by_pelatih_id: referredByPelatihId,
    referral_discount_type: referralDiscountType,
    referral_discount_value: referralDiscountValue,
    referral_komisi_per_sesi: referralKomisiPerSesi,
  });

  if (error) {
    redirect(`/daftar?error=${encodeURIComponent(error.message)}`);
  }

  const { data: adminPhone } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "phone")
    .single();

  await sendWhatsApp(
    adminPhone?.value,
    `Pendaftar baru: ${child_name} — ortu ${parent_name} (${parent_email}${
      parent_phone ? `, ${parent_phone}` : ""
    }). Cek di /admin/pendaftar.`
  );

  redirect("/daftar?success=1");
}
