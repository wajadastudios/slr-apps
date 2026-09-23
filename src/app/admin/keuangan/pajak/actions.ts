"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

function withError(to: string, message: string): string {
  return `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

const RETURN = "/admin/keuangan/pajak";

// "Perubahan profil harus memiliki tanggal efektif dan tidak mengubah data
// historis" -- a new row, never an UPDATE on the previous one. The "current"
// profile shown anywhere is simply the row with the latest effective_from
// that isn't in the future (resolveEntityProfile in lib/finance/tax.ts).
async function saveEntityProfileActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const section = `${RETURN}?section=profil`;

  const entity_name = String(formData.get("entity_name") ?? "").trim();
  const business_form = String(formData.get("business_form") ?? "");
  const npwp = String(formData.get("npwp") ?? "").trim() || null;
  const pkp_status = String(formData.get("pkp_status") ?? "belum_pkp");
  const fiscal_year_start_month = Number(formData.get("fiscal_year_start_month") ?? "1");
  const accountant_note = String(formData.get("accountant_note") ?? "").trim() || null;
  const effective_from = String(formData.get("effective_from") ?? "").trim();

  if (!entity_name || !business_form || !effective_from) {
    redirect(withError(section, "Nama entitas, bentuk usaha, dan tanggal efektif wajib diisi."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tax_entity_profile").insert({
    entity_name,
    business_form,
    npwp,
    pkp_status,
    fiscal_year_start_month,
    accountant_note,
    effective_from,
    created_by: session.user.id,
  });
  if (error) redirect(withError(section, "Profil belum dapat disimpan."));

  revalidatePath("/admin/keuangan/pajak");
  redirect(section);
}

// Sengaja tidak mengizinkan edit tarif/basis/tanggal mulai pada baris yang
// sudah ada -- perubahan tarif selalu berarti baris baru (lihat komentar di
// 0039_finance_module.sql). Yang boleh diubah pada baris lama hanyalah
// status aktif, status konfirmasi akuntan, tanggal berakhir, dan catatan.
async function createTaxSettingActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const section = `${RETURN}?section=pengaturan`;

  const tax_name = String(formData.get("tax_name") ?? "").trim();
  const tax_type = String(formData.get("tax_type") ?? "");
  const rate_percent_raw = String(formData.get("rate_percent") ?? "").trim();
  const rate_percent = rate_percent_raw ? Number(rate_percent_raw) : null;
  const calculation_method = String(formData.get("calculation_method") ?? "").trim() || null;
  const basis = String(formData.get("basis") ?? "");
  const effective_from = String(formData.get("effective_from") ?? "").trim();
  const effective_until = String(formData.get("effective_until") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const source_reference = String(formData.get("source_reference") ?? "").trim() || null;
  const active = String(formData.get("active") ?? "") === "true";

  if (!tax_name || !tax_type || !basis || !effective_from) {
    redirect(withError(section, "Nama pajak, jenis, dasar pengenaan, dan tanggal mulai wajib diisi."));
  }
  if (rate_percent !== null && (Number.isNaN(rate_percent) || rate_percent < 0)) {
    redirect(withError(section, "Tarif harus berupa angka 0 atau lebih."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tax_settings").insert({
    tax_name,
    tax_type,
    rate_percent,
    calculation_method,
    basis,
    effective_from,
    effective_until,
    active,
    note,
    source_reference,
    // sengaja selalu lahir sebagai "perlu dikonfirmasi akuntan" -- lihat
    // saveConfirmationActionImpl untuk cara mengubahnya setelah akuntan
    // benar-benar meninjau.
    created_by: session.user.id,
  });
  if (error) redirect(withError(section, "Pengaturan pajak belum dapat disimpan."));

  revalidatePath("/admin/keuangan/pajak");
  redirect(section);
}

async function updateTaxSettingStatusActionImpl(formData: FormData) {
  await requireAdmin();
  const section = `${RETURN}?section=pengaturan`;

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const confirmation_status = String(formData.get("confirmation_status") ?? "");
  const effective_until = String(formData.get("effective_until") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!id) redirect(withError(section, "Pengaturan pajak tidak ditemukan."));
  if (!["perlu_dikonfirmasi_akuntan", "dikonfirmasi_akuntan"].includes(confirmation_status)) {
    redirect(withError(section, "Status konfirmasi tidak valid."));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tax_settings")
    .update({ active, confirmation_status, effective_until, note })
    .eq("id", id);
  if (error) redirect(withError(section, error.message));

  revalidatePath("/admin/keuangan/pajak");
  redirect(section);
}

export const saveEntityProfileAction = safeAction(saveEntityProfileActionImpl, "Profil entitas disimpan (versi baru)");
export const createTaxSettingAction = safeAction(createTaxSettingActionImpl, "Pengaturan pajak disimpan");
export const updateTaxSettingStatusAction = safeAction(updateTaxSettingStatusActionImpl, "Status pengaturan pajak diperbarui");
