"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { blocking, participantConflicts, warnings, type SlotContext } from "@/lib/admin/schedule-rules";
import { loadSlotContexts, parseSlotInput, planSlot, syncEnrollmentSlot } from "@/lib/admin/slot-service";

function dest(formData: FormData, fallback = "/admin/jadwal"): string {
  const to = String(formData.get("return") ?? "");
  return to.startsWith("/admin/") ? to : fallback;
}

function fail(to: string, message: string): never {
  redirect(`${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function refresh(slotId?: string) {
  revalidatePath("/admin/jadwal");
  revalidatePath("/admin/slot-jadwal");
  if (slotId) revalidatePath(`/admin/jadwal/${slotId}`);
}

// ---------- add a participant to a session ----------
async function addParticipantImpl(formData: FormData) {
  await requireAdmin();
  const to = dest(formData);
  const student_id = String(formData.get("student_id") ?? "");
  const slot_id = String(formData.get("slot_id") ?? "");
  if (!student_id || !slot_id) fail(to, "Pilih peserta yang akan ditambahkan.");

  const supabase = await createClient();
  const { slots, rows } = await loadSlotContexts(supabase);
  const slot = slots.find((s) => s.id === slot_id);
  if (!slot) fail(to, "Sesi tidak ditemukan.");

  if (rows.some((r) => r.slot_id === slot_id && r.student_id === student_id)) {
    fail(to, "Peserta ini sudah ada di sesi tersebut.");
  }
  if (rows.filter((r) => r.slot_id === slot_id).length >= slot.capacity) {
    fail(to, "Sesi ini sudah penuh. Pilih sesi lain atau naikkan kapasitas.");
  }

  const { data: person } = await supabase.from("students").select("full_name").eq("id", student_id).maybeSingle();
  const theirs = rows
    .filter((r) => r.student_id === student_id)
    .map((r) => slots.find((s) => s.id === r.slot_id))
    .filter((s): s is SlotContext => !!s);
  const clash = participantConflicts(slot, person?.full_name ?? "Peserta", theirs);
  if (clash.length > 0) fail(to, clash[0].message);

  const { error } = await supabase.from("schedules").insert({ student_id, slot_id });
  if (error) {
    fail(to, error.message.includes("participant_conflict") ? "Jadwal peserta bentrok dengan kelas lain." : "Peserta belum dapat ditambahkan.");
  }
  await syncEnrollmentSlot(supabase, student_id, slot.program_id, slot_id);
  refresh(slot_id);
  redirect(to);
}

// ---------- move a participant to another session ----------
async function movePersonImpl(formData: FormData) {
  await requireAdmin();
  const to = dest(formData);
  const schedule_id = String(formData.get("schedule_id") ?? "");
  const to_slot_id = String(formData.get("to_slot_id") ?? "");
  if (!schedule_id || !to_slot_id) fail(to, "Pilih sesi tujuan.");

  const supabase = await createClient();
  const { slots, rows } = await loadSlotContexts(supabase);
  const row = rows.find((r) => r.schedule_id === schedule_id);
  const target = slots.find((s) => s.id === to_slot_id);
  const source = row ? slots.find((s) => s.id === row.slot_id) : undefined;
  if (!row || !target || !source) fail(to, "Data peserta atau sesi tidak ditemukan.");
  if (row.slot_id === to_slot_id) fail(to, "Peserta sudah berada di sesi ini.");
  if (target.program_id !== source.program_id) fail(to, "Peserta hanya dapat dipindahkan ke sesi program yang sama.");
  if (rows.filter((r) => r.slot_id === to_slot_id).length >= target.capacity) {
    fail(to, "Sesi tujuan sudah penuh.");
  }

  const theirOthers = rows
    .filter((r) => r.student_id === row.student_id && r.schedule_id !== schedule_id)
    .map((r) => slots.find((s) => s.id === r.slot_id))
    .filter((s): s is SlotContext => !!s);
  const clash = participantConflicts(target, row.name, theirOthers);
  if (clash.length > 0) fail(to, clash[0].message);

  const { error } = await supabase.from("schedules").update({ slot_id: to_slot_id }).eq("id", schedule_id);
  if (error) fail(to, "Peserta belum dapat dipindahkan.");
  await syncEnrollmentSlot(supabase, row.student_id, source.program_id, to_slot_id);
  refresh(row.slot_id);
  refresh(to_slot_id);
  redirect(to);
}

// ---------- take a participant out of a session ----------
async function removePersonImpl(formData: FormData) {
  await requireAdmin();
  const to = dest(formData);
  const schedule_id = String(formData.get("schedule_id") ?? "");
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("schedules")
    .select("id, student_id, slot_id")
    .eq("id", schedule_id)
    .maybeSingle();
  if (!row) fail(to, "Peserta tidak ditemukan di sesi ini.");
  const { data: slot } = await supabase.from("class_slots").select("program_id").eq("id", row.slot_id).maybeSingle();

  const { error } = await supabase.from("schedules").delete().eq("id", schedule_id);
  if (error) fail(to, "Peserta belum dapat dikeluarkan.");

  if (slot) {
    await syncEnrollmentSlot(supabase, row.student_id, slot.program_id, null);
    // a scheduled participant without a session goes back to waiting for one
    await supabase
      .from("enrollments")
      .update({ status: "waiting_schedule", updated_at: new Date().toISOString() })
      .eq("student_id", row.student_id)
      .eq("program_id", slot.program_id)
      .eq("status", "scheduled");
  }
  refresh(row.slot_id);
  redirect(to);
}

// ---------- change a session (step 1: check, then apply or ask) ----------
function carry(formData: FormData): URLSearchParams {
  const p = new URLSearchParams();
  for (const key of ["program_id", "pelatih_id", "label", "location", "day_of_week", "start_time", "duration_minutes", "capacity"]) {
    p.set(key, String(formData.get(key) ?? ""));
  }
  return p;
}

async function saveSlotChangeImpl(formData: FormData) {
  await requireAdmin();
  const slot_id = String(formData.get("slot_id") ?? "");
  const to = dest(formData, `/admin/jadwal/${slot_id}`);
  const parsed = parseSlotInput(formData);
  if (!parsed.ok) fail(to, parsed.error);

  const supabase = await createClient();
  const plan = await planSlot(supabase, slot_id, parsed.value);
  const hard = blocking(plan.conflicts);
  if (hard.length > 0) fail(to, hard.map((c) => c.message).join(" "));

  // participants who would end up double-booked block a change that keeps
  // everyone in place; the confirmation page offers "pick participants"
  const soft = warnings(plan.conflicts);
  if (plan.material || soft.length > 0) {
    redirect(`/admin/jadwal/${slot_id}/ubah?${carry(formData).toString()}&konfirmasi=1`);
  }

  const { error } = await supabase.from("class_slots").update(parsed.value).eq("id", slot_id);
  if (error) fail(to, "Sesi belum dapat diperbarui.");
  refresh(slot_id);
  redirect(to);
}

// ---------- change a session (step 2: confirmed) ----------
async function applySlotChangeImpl(formData: FormData) {
  await requireAdmin();
  const slot_id = String(formData.get("slot_id") ?? "");
  const to = `/admin/jadwal/${slot_id}`;
  const mode = String(formData.get("mode") ?? "all");
  const parsed = parseSlotInput(formData);
  if (!parsed.ok) fail(to, parsed.error);

  const supabase = await createClient();
  const plan = await planSlot(supabase, slot_id, parsed.value);
  const hard = blocking(plan.conflicts);
  if (hard.length > 0) fail(to, hard.map((c) => c.message).join(" "));
  if (warnings(plan.conflicts).length > 0 && formData.get("confirm_warnings") !== "on") {
    fail(`/admin/jadwal/${slot_id}/ubah?${carry(formData).toString()}`, "Centang konfirmasi peringatan terlebih dahulu.");
  }

  if (mode === "all") {
    // everyone stays: each participant must still be free at the new time
    const stuck = plan.affected.filter((a) => a.issues.length > 0);
    if (stuck.length > 0) {
      fail(
        `/admin/jadwal/${slot_id}/ubah?${carry(formData).toString()}`,
        `${stuck.map((s) => s.issues[0].message).join(" ")} Pilih peserta tertentu untuk dipindahkan, atau batalkan.`
      );
    }
    const { error } = await supabase.from("class_slots").update(parsed.value).eq("id", slot_id);
    if (error) fail(to, "Sesi belum dapat diperbarui.");
    refresh(slot_id);
    redirect(to);
  }

  // "some": the chosen participants move to a NEW session with the new
  // details; the current session stays as it is for everybody else
  const chosen = new Set(formData.getAll("schedule_ids").map(String));
  const moving = plan.affected.filter((a) => chosen.has(a.schedule_id));
  if (moving.length === 0) fail(`/admin/jadwal/${slot_id}/ubah?${carry(formData).toString()}`, "Pilih minimal satu peserta yang akan dipindahkan.");
  const stuck = moving.filter((a) => a.issues.length > 0);
  if (stuck.length > 0) fail(`/admin/jadwal/${slot_id}/ubah?${carry(formData).toString()}`, stuck.map((s) => s.issues[0].message).join(" "));
  if (moving.length > parsed.value.capacity) fail(`/admin/jadwal/${slot_id}/ubah?${carry(formData).toString()}`, "Kapasitas sesi baru lebih kecil dari jumlah peserta yang dipindahkan.");

  // the new session is checked like any other new session
  const newPlan = await planSlot(supabase, null, parsed.value);
  const newHard = blocking(newPlan.conflicts);
  if (newHard.length > 0) fail(`/admin/jadwal/${slot_id}/ubah?${carry(formData).toString()}`, newHard.map((c) => c.message).join(" "));

  // the current session may only keep going if it is not identical to the new one
  const { data: created, error: createError } = await supabase.from("class_slots").insert(parsed.value).select("id").single();
  if (createError || !created) fail(to, "Sesi baru belum dapat dibuat.");

  const { error: moveError } = await supabase
    .from("schedules")
    .update({ slot_id: created.id })
    .in("id", moving.map((m) => m.schedule_id));
  if (moveError) fail(to, "Peserta belum dapat dipindahkan ke sesi baru.");
  for (const m of moving) await syncEnrollmentSlot(supabase, m.student_id, parsed.value.program_id, created.id);

  refresh(slot_id);
  refresh(created.id);
  redirect(`/admin/jadwal/${created.id}`);
}

export const addParticipantAction = safeAction(addParticipantImpl, "Peserta ditambahkan ke sesi");
export const movePersonAction = safeAction(movePersonImpl, "Peserta dipindahkan");
export const removePersonAction = safeAction(removePersonImpl, "Peserta dikeluarkan dari sesi");
export const saveSlotChangeAction = safeAction(saveSlotChangeImpl, "Sesi diperbarui");
export const applySlotChangeAction = safeAction(applySlotChangeImpl, "Perubahan sesi disimpan");
