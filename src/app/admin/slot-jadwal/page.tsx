import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DAYS } from "@/lib/days";
import { createSlotAction } from "./actions";

export default async function SlotJadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: slots }, { data: pelatihList }, { data: programs }, { data: enrollments }] =
    await Promise.all([
      supabase
        .from("class_slots")
        .select(
          "id, label, day_of_week, start_time, capacity, programs:program_id(name), pelatih:pelatih_id(full_name)"
        )
        .order("day_of_week")
        .order("start_time"),
      supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "pelatih")
        .order("full_name"),
      supabase.from("programs").select("id, name").order("name"),
      supabase.from("schedules").select("slot_id"),
    ]);

  const filledCount = new Map<string, number>();
  for (const e of enrollments ?? []) {
    filledCount.set(e.slot_id, (filledCount.get(e.slot_id) ?? 0) + 1);
  }

  const canCreate = (pelatihList?.length ?? 0) > 0 && (programs?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Tambah Slot Jadwal
        </h2>
        <form action={createSlotAction} className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Program
            </label>
            <GlassSelect name="program_id" required defaultValue="">
              <option value="" disabled>
                Pilih program
              </option>
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </GlassSelect>
          </div>
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
              Label (opsional)
            </label>
            <GlassInput name="label" placeholder="Grup / Private" />
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
            <GlassInput name="start_time" type="time" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Kapasitas
            </label>
            <GlassInput name="capacity" type="number" min={1} required />
          </div>
          {error && (
            <p className="sm:col-span-3 lg:col-span-6 text-sm text-red-700 dark:text-red-300">
              {decodeURIComponent(error)}
            </p>
          )}
          {!canCreate && (
            <p className="sm:col-span-3 lg:col-span-6 text-sm text-amber-700 dark:text-amber-300">
              Butuh minimal satu pelatih terlebih dahulu sebelum membuat slot
              jadwal.
            </p>
          )}
          <GlassButton
            type="submit"
            disabled={!canCreate}
            className="sm:col-span-3 lg:col-span-6 sm:w-fit"
          >
            Tambah Slot
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Slot Jadwal
        </h2>
        <div className="flex flex-col gap-2">
          {(!slots || slots.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada slot jadwal.
            </p>
          )}
          {slots?.map((s) => {
            const filled = filledCount.get(s.id) ?? 0;
            const full = filled >= s.capacity;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5"
              >
                <span className="font-medium text-slate-900 dark:text-white">
                  {DAYS[s.day_of_week]}, {s.start_time} &mdash;{" "}
                  {(s.programs as unknown as { name: string } | null)?.name}
                  {s.label ? ` (${s.label})` : ""}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {(s.pelatih as unknown as { full_name: string } | null)
                    ?.full_name ?? "-"}{" "}
                  &middot;{" "}
                  <span className={full ? "text-red-700 dark:text-red-300" : ""}>
                    terisi {filled}/{s.capacity}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
