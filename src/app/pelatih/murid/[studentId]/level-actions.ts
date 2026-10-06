"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { hasClassAccess, type EnrollmentStatus } from "@/lib/enrollment";
import { loadCurriculumData, loadCurriculumMode } from "@/lib/curriculum/loader";
import { currentLevel, levelEligibility } from "@/lib/curriculum/levels";
import { levelLabel, type Level } from "@/lib/curriculum/types";
import { jakartaToday, toISODate } from "@/lib/week";

function back(student_id: string, program_id: string, error?: string) {
  const base = `/pelatih/murid/${student_id}${program_id ? `?program=${program_id}` : ""}`;
  return error ? `${base}${base.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}#level` : `${base}#level`;
}

// The pengajar confirms that a child has passed a level of ONE stroke. The
// server re-checks the criteria itself (every required indicator at the
// configured score on enough sessions, and the required test) -- the button
// being shown is not what authorises it. Confirmation, not an average, moves a
// child up.
async function confirmLevelUpActionImpl(formData: FormData) {
  const session = await requirePelatih();
  const student_id = String(formData.get("student_id") ?? "");
  const enrollment_id = String(formData.get("enrollment_id") ?? "");
  const skill_id = String(formData.get("group_id") ?? "");
  if (!student_id || !enrollment_id || !skill_id) redirect(back(student_id, "", "Data tidak lengkap."));

  const supabase = await createClient();
  const { data: mine } = await supabase.rpc("pelatih_enrollments");
  const enrollment = ((mine ?? []) as { id: string; student_id: string; program_id: string; status: EnrollmentStatus }[]).find(
    (e) => e.id === enrollment_id && e.student_id === student_id
  );
  if (!enrollment) redirect(back(student_id, "", "Anda tidak mengajar peserta ini di program tersebut."));
  if (!hasClassAccess(enrollment.status)) redirect(back(student_id, enrollment.program_id, "Kelas peserta ini belum aktif."));
  if ((await loadCurriculumMode(supabase, enrollment.program_id)) !== "levels_v1") {
    redirect(back(student_id, enrollment.program_id, "Program ini belum memakai kurikulum level."));
  }

  const data = await loadCurriculumData(supabase, { programId: enrollment.program_id, enrollmentId: enrollment_id });
  const skill = data.skills.find((s) => s.id === skill_id && s.hasLevels);
  if (!skill) redirect(back(student_id, enrollment.program_id, "Skill tidak ditemukan."));

  const current = currentLevel(skill.id, data.levelEvents);
  if (!current) redirect(back(student_id, enrollment.program_id, `${skill.name} belum punya level awal. Tentukan saat mengisi laporan.`));
  if (current.level >= 3) redirect(back(student_id, enrollment.program_id, `${skill.name} sudah di level tertinggi.`));

  const eligibility = levelEligibility({
    skill,
    level: current.level,
    indicators: data.indicators,
    reports: data.reports,
    results: data.results,
    testTypes: data.testTypes,
    targets: data.targets,
    rules: data.rules,
  });
  if (!eligibility.eligible) {
    redirect(
      back(
        student_id,
        enrollment.program_id,
        `${levelLabel(current.level)} ${skill.name} belum memenuhi syarat lulus: ${eligibility.checks
          .filter((c) => !c.ok)
          .map((c) => c.label)
          .join(", ")}.`
      )
    );
  }

  const next = (current.level + 1) as Level;
  const { error } = await supabase.from("skill_level_events").insert({
    enrollment_id,
    group_id: skill.id,
    level: next,
    kind: "promotion",
    effective_on: toISODate(jakartaToday()),
    confirmed_by: session.user.id,
    note: `Lulus ${levelLabel(current.level)}`,
    evidence: { checks: eligibility.checks },
  });
  if (error) {
    redirect(
      back(
        student_id,
        enrollment.program_id,
        error.message.includes("promotion_must_follow_previous_level")
          ? "Level anak ini sudah berubah. Muat ulang halaman."
          : "Kenaikan level tidak dapat disimpan. Coba lagi."
      )
    );
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  revalidatePath(`/ortu/anak/${student_id}`);
  redirect(back(student_id, enrollment.program_id));
}

export const confirmLevelUpAction = safeAction(confirmLevelUpActionImpl, "Kenaikan level dicatat");
