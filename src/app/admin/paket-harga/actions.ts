"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

async function createPackageActionImpl(formData: FormData) {
  const session = await requireAdmin();

  const program_id = String(formData.get("program_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sessions_count = Number(formData.get("sessions_count") ?? "");
  const price = Number(formData.get("price") ?? "");
  const badge = String(formData.get("badge") ?? "").trim() || null;
  let benefits: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("benefits") ?? "[]"));
    if (Array.isArray(parsed)) benefits = parsed.filter((s) => typeof s === "string");
  } catch {
    benefits = [];
  }

  if (!program_id || !name || !sessions_count || sessions_count < 1 || price < 0) {
    redirect(
      `/admin/paket-harga?id=${program_id}&error=${encodeURIComponent(
        "Program, nama, jumlah sesi (min 1), dan harga wajib diisi dengan benar."
      )}`
    );
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("program_packages")
    .insert({ program_id, name, sessions_count, price, benefits, badge })
    .select("id")
    .single();

  if (error || !created) {
    redirect(
      `/admin/paket-harga?id=${program_id}&error=${encodeURIComponent(error?.message ?? "Paket belum dapat dibuat.")}`
    );
  }

  // Its first price version, so this package has a real history from day
  // one instead of only a bare cache column.
  await supabase.from("package_price_versions").insert({
    program_package_id: created!.id,
    price,
    created_by: session.user.id,
  });

  revalidatePath("/admin/paket-harga");
  revalidatePath("/admin/tagihan");
  redirect(`/admin/paket-harga?id=${program_id}`);
}

async function togglePackageActiveActionImpl(formData: FormData) {
  await requireAdmin();

  const package_id = String(formData.get("package_id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";

  const supabase = await createClient();
  await supabase
    .from("program_packages")
    .update({ active: nextActive })
    .eq("id", package_id);

  revalidatePath("/admin/paket-harga");
  revalidatePath("/admin/tagihan");
}

// Everything about a package EXCEPT its price -- a price change goes through
// createPackagePriceVersionAction instead, which versions it rather than
// overwriting the number every existing invoice/enrollment-lock reference
// still points at (see 0038_price_versioning.sql).
async function updatePackageActionImpl(formData: FormData) {
  await requireAdmin();

  const package_id = String(formData.get("package_id") ?? "");
  const program_id = String(formData.get("program_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sessions_count = Number(formData.get("sessions_count") ?? "");
  const badge = String(formData.get("badge") ?? "").trim() || null;
  let benefits: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("benefits") ?? "[]"));
    if (Array.isArray(parsed)) benefits = parsed.filter((s) => typeof s === "string");
  } catch {
    benefits = [];
  }

  if (!name || !sessions_count || sessions_count < 1) {
    redirect(
      `/admin/paket-harga?id=${program_id}&editPkg=${package_id}&error=${encodeURIComponent(
        "Nama dan jumlah sesi (min 1) wajib diisi dengan benar."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("program_packages")
    .update({ name, sessions_count, benefits, badge })
    .eq("id", package_id);

  if (error) {
    redirect(
      `/admin/paket-harga?id=${program_id}&editPkg=${package_id}&error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/admin/paket-harga");
  revalidatePath("/admin/tagihan");
  redirect(`/admin/paket-harga?id=${program_id}`);
}

// Kebijakan C: never overwrite a package's price. Closes out the current
// open version (effective_until = now) and opens a new one, then refreshes
// program_packages.price/currency, which is only ever a cache of "the
// current version's price" for callers that want the latest price without a
// join (the landing page, the ortu package picker, new-registrant flows).
// Nothing already billed (invoices) or already locked in (enrollment_price_
// locks) reads program_packages.price directly, so neither is affected.
async function createPackagePriceVersionActionImpl(formData: FormData) {
  const session = await requireAdmin();

  const package_id = String(formData.get("package_id") ?? "");
  const program_id = String(formData.get("program_id") ?? "");
  const price = Number(formData.get("price") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const effectiveFromRaw = String(formData.get("effective_from") ?? "").trim();

  if (!package_id || price < 0 || Number.isNaN(price)) {
    redirect(
      `/admin/paket-harga?id=${program_id}&error=${encodeURIComponent("Harga baru wajib diisi dengan benar.")}`
    );
  }

  const effectiveFrom = effectiveFromRaw ? new Date(effectiveFromRaw) : new Date();
  const effectiveFromIso = effectiveFrom.toISOString();

  const supabase = await createClient();

  // Closing the old version, inserting the new one, and refreshing the
  // program_packages.price cache happen in one transaction (see
  // 0041_price_version_atomicity.sql) -- a failed insert can no longer leave
  // the package with no open version, and a retry that resubmits the same
  // price as the currently open version is a no-op rather than a duplicate.
  const { error } = await supabase.rpc("create_package_price_version", {
    p_package_id: package_id,
    p_price: price,
    p_note: note,
    p_effective_from: effectiveFromIso,
    p_created_by: session.user.id,
  });
  if (error) {
    redirect(`/admin/paket-harga?id=${program_id}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/paket-harga");
  revalidatePath("/admin/tagihan");
  redirect(`/admin/paket-harga?id=${program_id}`);
}

async function deletePackageActionImpl(formData: FormData) {
  await requireAdmin();

  const package_id = String(formData.get("package_id") ?? "");
  const program_id = String(formData.get("program_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("program_packages")
    .delete()
    .eq("id", package_id);

  if (error) {
    redirect(
      `/admin/paket-harga?id=${program_id}&error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/admin/paket-harga");
  revalidatePath("/admin/tagihan");
  redirect(`/admin/paket-harga?id=${program_id}`);
}

export const createPackageAction = safeAction(createPackageActionImpl, "Paket harga berhasil ditambahkan");
export const togglePackageActiveAction = safeAction(togglePackageActiveActionImpl, "Status paket berhasil diperbarui");
export const updatePackageAction = safeAction(updatePackageActionImpl, "Paket harga berhasil diperbarui");
export const createPackagePriceVersionAction = safeAction(createPackagePriceVersionActionImpl, "Versi harga baru dibuat");
export const deletePackageAction = safeAction(deletePackageActionImpl, "Paket harga berhasil dihapus");
