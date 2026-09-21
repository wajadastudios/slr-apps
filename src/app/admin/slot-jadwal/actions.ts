"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { blocking, warnings } from "@/lib/admin/schedule-rules";
import { parseSlotInput, planSlot } from "@/lib/admin/slot-service";

function withError(to: string, message: string): string {
  return `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

function dest(formData: FormData, fallback: string): string {
  const to = String(formData.get("return") ?? "");
  return to.startsWith("/admin/") ? to : fallback;
}

// A new slot is checked before it is saved: a certain conflict blocks it, a
// shared pool needs an explicit confirmation.
async function createSlotActionImpl(formData: FormData) {
  await requireAdmin();
  const to = "/admin/slot-jadwal";

  const parsed = parseSlotInput(formData);
  if (!parsed.ok) redirect(withError(to, parsed.error));

  const supabase = await createClient();
  const plan = await planSlot(supabase, null, parsed.value);

  const hard = blocking(plan.conflicts);
  if (hard.length > 0) redirect(withError(to, hard.map((c) => c.message).join(" ")));

  const soft = warnings(plan.conflicts);
  if (soft.length > 0 && formData.get("confirm_warnings") !== "on") {
    redirect(
      withError(
        to,
        `${soft.map((c) => c.message).join(" ")} Centang "Saya mengerti peringatan" lalu simpan lagi jika memang ingin melanjutkan.`
      )
    );
  }

  const { error } = await supabase.from("class_slots").insert(parsed.value);
  if (error) {
    redirect(
      withError(
        to,
        error.message.includes("slot_conflict_pelatih")
          ? "Pengajar ini sudah mengajar pada jam yang bertabrakan."
          : error.message.includes("slot_duplicate")
            ? "Slot yang sama sudah ada."
            : "Slot belum dapat disimpan. Periksa data lalu coba lagi."
      )
    );
  }

  revalidatePath("/admin/slot-jadwal");
  revalidatePath("/admin/jadwal");
  redirect(to);
}

// A slot is never deleted silently, and never while people are still in it.
async function deleteSlotActionImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const to = dest(formData, "/admin/slot-jadwal");
  const supabase = await createClient();

  const { count } = await supabase.from("schedules").select("id", { count: "exact", head: true }).eq("slot_id", id);
  if ((count ?? 0) > 0) {
    redirect(
      withError(
        to,
        `Sesi ini masih berisi ${count} peserta. Pindahkan atau keluarkan peserta dari roster terlebih dahulu.`
      )
    );
  }

  const { error } = await supabase.from("class_slots").delete().eq("id", id);
  if (error) redirect(withError(to, "Slot belum dapat dihapus."));

  revalidatePath("/admin/slot-jadwal");
  revalidatePath("/admin/jadwal");
  redirect(to);
}

export const createSlotAction = safeAction(createSlotActionImpl, "Slot jadwal berhasil ditambahkan");
export const deleteSlotAction = safeAction(deleteSlotActionImpl, "Slot jadwal berhasil dihapus");
