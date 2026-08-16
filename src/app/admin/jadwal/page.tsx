import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DAYS } from "@/lib/days";
import { enrollStudentAction } from "./actions";

export default async function JadwalMuridPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: enrollments }, { data: students }, { data: slots }] =
    await Promise.all([
      supabase
        .from("schedules")
        .select(
          "id, student:student_id(full_name), slot:slot_id(label, day_of_week, start_time, programs:program_id(name), pelatih:pelatih_id(full_name))"
        )
        .order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name").order("full_name"),
      supabase
        .from("class_slots")
        .select(
          "id, label, day_of_week, start_time, capacity, programs:program_id(name), pelatih:pelatih_id(full_name)"
        )
        .order("day_of_week")
        .order("start_time"),
    ]);

  const { data: allEnrollmentSlots } = await supabase
    .from("schedules")
    .select("slot_id");

  const filledCount = new Map<string, number>();
  for (const e of allEnrollmentSlots ?? []) {
    filledCount.set(e.slot_id, (filledCount.get(e.slot_id) ?? 0) + 1);
  }

  const slotOptions = (slots ?? []).map((s) => {
    const filled = filledCount.get(s.id) ?? 0;
    const full = filled >= s.capacity;
    const program = (s.programs as unknown as { name: string } | null)?.name;
    const pelatih = (s.pelatih as unknown as { full_name: string } | null)
      ?.full_name;
    const labelText = `${DAYS[s.day_of_week]}, ${s.start_time} — ${program}${
      s.label ? ` (${s.label})` : ""
    } — ${pelatih} — sisa ${Math.max(s.capacity - filled, 0)}/${s.capacity}`;
    return { id: s.id, label: labelText, full };
  });

  const canEnroll = (students?.length ?? 0) > 0 && slotOptions.some((s) => !s.full);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftarkan Murid ke Slot Jadwal
        </h2>
        <form
          action={enrollStudentAction}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Murid
            </label>
            <GlassSelect name="student_id" required defaultValue="">
              <option value="" disabled>
                Pilih murid
              </option>
              {students?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Slot Jadwal
            </label>
            <GlassSelect name="slot_id" required defaultValue="">
              <option value="" disabled>
                Pilih slot jadwal
              </option>
              {slotOptions.map((s) => (
                <option key={s.id} value={s.id} disabled={s.full}>
                  {s.label}
                  {s.full ? " — PENUH" : ""}
                </option>
              ))}
            </GlassSelect>
          </div>
          {error && (
            <p className="sm:col-span-2 text-sm text-red-700 dark:text-red-300">
              {decodeURIComponent(error)}
            </p>
          )}
          {(!slots || slots.length === 0) && (
            <p className="sm:col-span-2 text-sm text-amber-700 dark:text-amber-300">
              Belum ada slot jadwal — buat dulu di halaman Slot Jadwal.
            </p>
          )}
          <GlassButton
            type="submit"
            disabled={!canEnroll}
            className="sm:col-span-2 sm:w-fit"
          >
            Daftarkan
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Jadwal Murid
        </h2>
        <div className="flex flex-col gap-2">
          {(!enrollments || enrollments.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada murid terdaftar di jadwal.
            </p>
          )}
          {enrollments?.map((e) => {
            const slot = e.slot as unknown as {
              label: string | null;
              day_of_week: number;
              start_time: string;
              programs: { name: string } | null;
              pelatih: { full_name: string } | null;
            } | null;
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5"
              >
                <span className="font-medium text-slate-900 dark:text-white">
                  {(e.student as unknown as { full_name: string } | null)
                    ?.full_name ?? "-"}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {slot
                    ? `${DAYS[slot.day_of_week]}, ${slot.start_time} — ${
                        slot.programs?.name
                      }${slot.label ? ` (${slot.label})` : ""} — ${
                        slot.pelatih?.full_name ?? "-"
                      }`
                    : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
