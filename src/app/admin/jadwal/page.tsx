import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { DAYS } from "@/lib/days";
import { enrollStudentAction, deleteEnrollmentAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

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
          "id, student:student_id(full_name), slot:slot_id(label, location, day_of_week, start_time, programs:program_id(name), pelatih:pelatih_id(full_name, title))"
        )
        .order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name").order("full_name"),
      supabase
        .from("class_slots")
        .select(
          "id, label, location, day_of_week, start_time, capacity, programs:program_id(name), pelatih:pelatih_id(full_name, title)"
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
    const pelatihRow = s.pelatih as unknown as {
      full_name: string;
      title: string | null;
    } | null;
    const pelatih = pelatihRow
      ? pelatihRow.title
        ? `${pelatihRow.title} ${pelatihRow.full_name}`
        : pelatihRow.full_name
      : "-";
    const labelText = `${DAYS[s.day_of_week]}, ${s.start_time} — ${program}${
      s.label ? ` (${s.label})` : ""
    } — ${pelatih}${s.location ? ` — ${s.location}` : ""} — sisa ${Math.max(
      s.capacity - filled,
      0
    )}/${s.capacity}`;
    return { id: s.id, label: labelText, full };
  });

  const canEnroll = (students?.length ?? 0) > 0 && slotOptions.some((s) => !s.full);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftarkan Siswa ke Slot Jadwal</h2>
        <form
          action={enrollStudentAction}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Siswa</label>
            <GlassSelect name="student_id" required defaultValue="">
              <option value="" disabled>
                Pilih siswa
              </option>
              {students?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Slot Jadwal</label>
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
            <p className="text-sm text-red-700 sm:col-span-2">
              {decodeURIComponent(error)}
            </p>
          )}
          {(!slots || slots.length === 0) && (
            <p className="text-sm text-amber-700 sm:col-span-2">
              Belum ada slot jadwal — buat dulu di halaman Slot Jadwal.
            </p>
          )}
          <GlassButton
            type="submit"
            disabled={!canEnroll}
            className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba] sm:col-span-2 sm:w-fit"
          >
            Daftarkan
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Jadwal Siswa</h2>
        <div className="flex flex-col gap-2">
          {(!enrollments || enrollments.length === 0) && (
            <p className="text-sm text-slate-600">
              Belum ada siswa terdaftar di jadwal.
            </p>
          )}
          {enrollments?.map((e) => {
            const slot = e.slot as unknown as {
              label: string | null;
              location: string | null;
              day_of_week: number;
              start_time: string;
              programs: { name: string } | null;
              pelatih: { full_name: string; title: string | null } | null;
            } | null;
            const pelatihLabel = slot?.pelatih
              ? slot.pelatih.title
                ? `${slot.pelatih.title} ${slot.pelatih.full_name}`
                : slot.pelatih.full_name
              : "-";
            return (
              <DataRow
                key={e.id}
                primary={
                  (e.student as unknown as { full_name: string } | null)
                    ?.full_name ?? "-"
                }
                secondary={
                  slot
                    ? `${DAYS[slot.day_of_week]}, ${slot.start_time} — ${
                        slot.programs?.name
                      }${slot.label ? ` (${slot.label})` : ""} — ${pelatihLabel}${
                        slot.location ? ` — ${slot.location}` : ""
                      }`
                    : "-"
                }
                action={
                  <form action={deleteEnrollmentAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <ConfirmSubmitButton
                      message="Keluarkan siswa ini dari slot jadwal?"
                      className="!border-red-300 !bg-red-500/10 px-4 py-2 text-sm !text-red-700 hover:!bg-red-500/20"
                    >
                      Hapus
                    </ConfirmSubmitButton>
                  </form>
                }
              />
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
