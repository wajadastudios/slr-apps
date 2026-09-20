"use server";

import { redirect } from "next/navigation";
import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteStorageFileFromUrl } from "@/lib/storage";
import { GENDER_OPTIONS, normalizePhone } from "@/lib/registration-input";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { sendWhatsApp } from "@/lib/whatsapp";
import { participantInviteMessage } from "@/lib/enrollment";

async function uploadAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File
) {
  const path = `avatars/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage
    .from("progress-media")
    .upload(path, file, { contentType: file.type });
  if (error) return null;
  const { data } = supabase.storage.from("progress-media").getPublicUrl(path);
  return data.publicUrl;
}

async function updateOwnProfileActionImpl(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const photo = formData.get("photo");

  // The avatar to delete is read from this account's own row, never from a
  // client-supplied "current_avatar_url" field -- that field is attacker
  // controlled and could point at any file in the shared progress-media
  // bucket.
  const { data: current } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", user.id)
    .single();

  let avatar_url: string | null = current?.avatar_url ?? null;
  if (photo instanceof File && photo.size > 0) {
    const uploaded = await uploadAvatar(supabase, photo);
    if (uploaded) {
      if (avatar_url) await deleteStorageFileFromUrl(supabase, avatar_url);
      avatar_url = uploaded;
    }
  }

  const { error } = await supabase.rpc("update_own_profile", {
    p_full_name: full_name,
    p_phone: phone,
    p_address: address,
    p_avatar_url: avatar_url,
  });

  if (error) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/ortu/pengaturan");
}

async function updateChildProfileActionImpl(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const student_id = String(formData.get("student_id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const nickname = String(formData.get("nickname") ?? "").trim() || null;
  const photo = formData.get("photo");

  if (!student_id) return;

  // Confirm this parent actually owns the student -- and read the avatar to
  // delete from that row -- before touching storage. The RPC below enforces
  // the same ownership rule for the DB update, but the storage delete has
  // to be gated here too, since a client-supplied "current_avatar_url"
  // could otherwise point at any file in the shared progress-media bucket.
  const { data: current } = await supabase
    .from("students")
    .select("avatar_url, parent_id")
    .eq("id", student_id)
    .single();

  if (!current || current.parent_id !== user.id) return;

  let avatar_url: string | null = current.avatar_url;
  if (photo instanceof File && photo.size > 0) {
    const uploaded = await uploadAvatar(supabase, photo);
    if (uploaded) {
      if (avatar_url) await deleteStorageFileFromUrl(supabase, avatar_url);
      avatar_url = uploaded;
    }
  }

  const { error } = await supabase.rpc("update_own_child_profile", {
    p_student_id: student_id,
    p_full_name: full_name,
    p_nickname: nickname,
    p_avatar_url: avatar_url,
  });

  if (error) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/ortu/pengaturan");
  revalidatePath("/ortu");
}

// The participant's own details (gender, WhatsApp, birth date). These belong
// to the participant, not to the login account; the database only lets the
// participant (or an adult who registered themselves) change them.
async function updateParticipantProfileActionImpl(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const student_id = String(formData.get("student_id") ?? "");
  const gender = String(formData.get("gender") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const birth = String(formData.get("birth_date") ?? "").trim();
  if (!student_id) return;

  if (gender && !GENDER_OPTIONS.some((g) => g.value === gender)) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent("Jenis kelamin tidak valid.")}`);
  }
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent("Nomor WhatsApp tidak valid.")}`);
  }
  if (birth && (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(birth)))) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent("Tanggal lahir tidak valid.")}`);
  }

  const { data, error } = await supabase.rpc("update_participant_profile", {
    p_student_id: student_id,
    p_gender: gender,
    p_phone: phone ?? "",
    p_birth_date: birth || null,
  });
  if (error || data !== "ok") {
    redirect(
      `/ortu/pengaturan?error=${encodeURIComponent(
        data === "invalid_gender" ? "Jenis kelamin tidak valid." : "Profil peserta belum dapat disimpan."
      )}`
    );
  }
  revalidatePath("/ortu/pengaturan");
  revalidatePath("/ortu");
}

// "Izinkan pendaftar melihat jadwal dan laporan kelas saya" -- only the
// participant can turn this on or off, per enrollment.
async function setReportAccessActionImpl(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const enrollment_id = String(formData.get("enrollment_id") ?? "");
  if (!enrollment_id) return;
  const allow = formData.get("allow") === "on";

  const { data, error } = await supabase.rpc("set_report_access", {
    p_enrollment_id: enrollment_id,
    p_allow: allow,
  });
  if (error || data !== "ok") {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent("Izin belum dapat disimpan. Hanya peserta yang dapat mengubahnya.")}`);
  }
  revalidatePath("/ortu/pengaturan");
  revalidatePath("/ortu");
}

// A participant who stays inside the family account can be invited later to
// take over their own account. The invitation goes to THEIR WhatsApp.
async function inviteParticipantActionImpl(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const student_id = String(formData.get("student_id") ?? "");
  if (!student_id) return;

  const { data: token } = await supabase.rpc("invite_participant", { p_student_id: student_id });
  if (typeof token !== "string" || !token) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent("Undangan belum dapat dikirim untuk peserta ini.")}`);
  }

  const admin = createAdminClient();
  const [{ data: participant }, { data: sender }, { data: programs }] = await Promise.all([
    admin.from("students").select("full_name, phone").eq("id", student_id).maybeSingle(),
    admin.from("users").select("full_name").eq("id", user.id).maybeSingle(),
    admin
      .from("enrollments")
      .select("program:program_id(name)")
      .eq("student_id", student_id)
      .not("status", "in", "(cancelled,rejected)"),
  ]);
  if (!participant?.phone) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent("Nomor WhatsApp peserta belum ada, undangan tidak dapat dikirim.")}`);
  }

  const programNames = (programs ?? [])
    .map((p) => (p.program as unknown as { name: string } | null)?.name)
    .filter(Boolean)
    .join(", ");
  await sendWhatsApp(
    participant.phone,
    participantInviteMessage({
      name: (participant.full_name ?? "").split(" ")[0] || "Peserta",
      registeredBy: sender?.full_name ?? "Keluarga Anda",
      program: programNames || "kelas renang",
      link: `${await getSiteOrigin()}/klaim/${token}`,
    })
  );
  revalidatePath("/ortu/pengaturan");
}

export const updateOwnProfileAction = safeAction(updateOwnProfileActionImpl, "Profil berhasil disimpan");
export const updateChildProfileAction = safeAction(updateChildProfileActionImpl, "Profil anak berhasil disimpan");
export const updateParticipantProfileAction = safeAction(updateParticipantProfileActionImpl, "Profil peserta berhasil disimpan");
export const setReportAccessAction = safeAction(setReportAccessActionImpl, "Pengaturan akses berhasil disimpan");
export const inviteParticipantAction = safeAction(inviteParticipantActionImpl, "Undangan dikirim ke WhatsApp peserta");
