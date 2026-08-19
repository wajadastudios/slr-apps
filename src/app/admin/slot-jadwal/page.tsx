import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { DAYS } from "@/lib/days";
import {
  createSlotAction,
  updateSlotAction,
  deleteSlotAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function SlotJadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { error, edit } = await searchParams;
  const supabase = await createClient();

  const [{ data: slots }, { data: pelatihList }, { data: programs }, { data: enrollments }] =
    await Promise.all([
      supabase
        .from("class_slots")
        .select(
          "id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, programs:program_id(name), pelatih:pelatih_id(full_name, title)"
        )
        .order("day_of_week")
        .order("start_time"),
      supabase
        .from("users")
        .select("id, full_name, title")
        .eq("role", "pelatih")
        .eq("active", true)
        .order("full_name"),
      supabase.from("programs").select("id, name").order("name"),
      supabase.from("schedules").select("slot_id"),
    ]);

  const filledCount = new Map<string, number>();
  for (const e of enrollments ?? []) {
    filledCount.set(e.slot_id, (filledCount.get(e.slot_id) ?? 0) + 1);
  }

  const canCreate = (pelatihList?.length ?? 0) > 0 && (programs?.length ?? 0) > 0;
  const editingSlot = edit ? slots?.find((s) => s.id === edit) : undefined;
  const isEditing = Boolean(editingSlot);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>
          {isEditing ? "Edit Slot Jadwal" : "Tambah Slot Jadwal"}
        </h2>
        <form
          action={isEditing ? updateSlotAction : createSlotAction}
          className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7"
        >
          {isEditing && (
            <input type="hidden" name="slot_id" value={editingSlot!.id} />
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Program</label>
            <GlassSelect
              name="program_id"
              required
              defaultValue={editingSlot?.program_id ?? ""}
            >
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
            <label className="text-sm text-slate-800">Pengajar</label>
            <GlassSelect
              name="pelatih_id"
              required
              defaultValue={editingSlot?.pelatih_id ?? ""}
            >
              <option value="" disabled>
                Pilih pengajar
              </option>
              {pelatihList?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title ? `${p.title} ${p.full_name}` : p.full_name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Label (opsional)</label>
            <GlassInput
              name="label"
              placeholder="Grup / Private"
              defaultValue={editingSlot?.label ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Lokasi Kolam</label>
            <GlassInput
              name="location"
              placeholder="Kolam A / Cabang Selatan"
              defaultValue={editingSlot?.location ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Hari</label>
            <GlassSelect
              name="day_of_week"
              required
              defaultValue={editingSlot?.day_of_week ?? ""}
            >
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
            <label className="text-sm text-slate-800">Jam</label>
            <GlassInput
              name="start_time"
              type="time"
              required
              defaultValue={editingSlot?.start_time ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Kapasitas</label>
            <GlassInput
              name="capacity"
              type="number"
              min={1}
              required
              defaultValue={editingSlot?.capacity ?? ""}
            />
          </div>
          {error && (
            <p className="text-sm text-red-700 sm:col-span-3 lg:col-span-7">
              {decodeURIComponent(error)}
            </p>
          )}
          {!canCreate && (
            <p className="text-sm text-amber-700 sm:col-span-3 lg:col-span-7">
              Butuh minimal satu pengajar terlebih dahulu sebelum membuat slot
              jadwal.
            </p>
          )}
          <div className="flex items-center gap-3 sm:col-span-3 lg:col-span-7">
            <GlassButton
              type="submit"
              disabled={!canCreate}
              className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba] w-fit"
            >
              {isEditing ? "Simpan Perubahan" : "Tambah Slot"}
            </GlassButton>
            {isEditing && (
              <a
                href="/admin/slot-jadwal"
                className="text-sm text-slate-600 underline"
              >
                Batal
              </a>
            )}
          </div>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Slot Jadwal</h2>
        <div className="flex flex-col gap-2">
          {(!slots || slots.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada slot jadwal.</p>
          )}
          {slots?.map((s) => {
            const filled = filledCount.get(s.id) ?? 0;
            const full = filled >= s.capacity;
            return (
              <DataRow
                key={s.id}
                primary={
                  <>
                    {DAYS[s.day_of_week]}, {s.start_time} &mdash;{" "}
                    {(s.programs as unknown as { name: string } | null)?.name}
                    {s.label ? ` (${s.label})` : ""}
                  </>
                }
                secondary={
                  <>
                    {(() => {
                      const pelatih = s.pelatih as unknown as {
                        full_name: string;
                        title: string | null;
                      } | null;
                      if (!pelatih) return "-";
                      return pelatih.title
                        ? `${pelatih.title} ${pelatih.full_name}`
                        : pelatih.full_name;
                    })()}{" "}
                    &middot;{" "}
                    <span className={full ? "text-red-700" : ""}>
                      terisi {filled}/{s.capacity}
                    </span>
                    {s.location ? <> &middot; {s.location}</> : null}
                  </>
                }
                action={
                  <>
                    <a
                      href={`/admin/slot-jadwal?edit=${s.id}`}
                      className="rounded-2xl border border-white/30 bg-white/30 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur-xl hover:bg-white/40"
                    >
                      Edit
                    </a>
                    <form action={deleteSlotAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmitButton
                        message={
                          filled > 0
                            ? `Slot ini memiliki ${filled} siswa terdaftar. Menghapusnya akan mengeluarkan mereka dari jadwal ini. Lanjutkan?`
                            : "Hapus slot jadwal ini?"
                        }
                        className="!border-red-300 !bg-red-500/10 px-4 py-2 text-sm !text-red-700 hover:!bg-red-500/20"
                      >
                        Hapus
                      </ConfirmSubmitButton>
                    </form>
                  </>
                }
              />
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
