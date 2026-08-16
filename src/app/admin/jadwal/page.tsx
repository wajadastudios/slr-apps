import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { createJadwalAction } from "./actions";

const DAYS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

export default async function JadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: schedules }, { data: pelatihList }, { data: students }] =
    await Promise.all([
      supabase
        .from("schedules")
        .select(
          "id, day_of_week, start_time, pelatih:pelatih_id(full_name), student:student_id(full_name)"
        )
        .order("day_of_week"),
      supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "pelatih")
        .order("full_name"),
      supabase.from("students").select("id, full_name").order("full_name"),
    ]);

  const canCreate = (pelatihList?.length ?? 0) > 0 && (students?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Tambah Jadwal
        </h2>
        <form action={createJadwalAction} className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Pelatih
            </label>
            <GlassSelect name="pelatih_id" required defaultValue="">
              <option value="" disabled>
                Pilih pelatih
              </option>
              {pelatihList?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </GlassSelect>
          </div>
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
              Hari
            </label>
            <GlassSelect name="day_of_week" required defaultValue="">
              <option value="" disabled>
                Pilih hari
              </option>
              {DAYS.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Jam
            </label>
            <GlassInput name="start_time" type="time" />
          </div>
          {error && (
            <p className="sm:col-span-4 text-sm text-red-700 dark:text-red-300">
              {decodeURIComponent(error)}
            </p>
          )}
          {!canCreate && (
            <p className="sm:col-span-4 text-sm text-amber-700 dark:text-amber-300">
              Butuh minimal satu pelatih dan satu murid sebelum membuat
              jadwal.
            </p>
          )}
          <GlassButton
            type="submit"
            disabled={!canCreate}
            className="sm:col-span-4 sm:w-fit"
          >
            Tambah Jadwal
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Jadwal
        </h2>
        <div className="flex flex-col gap-2">
          {(!schedules || schedules.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada jadwal.
            </p>
          )}
          {schedules?.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5"
            >
              <span className="font-medium text-slate-900 dark:text-white">
                {(s.pelatih as unknown as { full_name: string } | null)
                  ?.full_name ?? "-"}{" "}
                &rarr;{" "}
                {(s.student as unknown as { full_name: string } | null)
                  ?.full_name ?? "-"}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {DAYS[s.day_of_week as number]}
                {s.start_time ? `, ${s.start_time}` : ""}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
