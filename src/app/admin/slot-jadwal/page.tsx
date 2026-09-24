import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, EmptyState, FIELD_CLASS, FilterBar, PageHeader, type Tone } from "@/components/admin/ui";
import { ImpactConfirm } from "@/components/admin/impact-confirm";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { selectAll } from "@/lib/admin/load";
import { coachName, dayName, formatRange, slotFill, FILL_LABEL, type SlotFill } from "@/lib/admin/format";
import { DAYS } from "@/lib/days";
import { createSlotAction, deleteSlotAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const FILL_TONE: Record<SlotFill, Tone> = { penuh: "danger", hampir_penuh: "warn", terisi_sebagian: "info", tersedia: "ok" };
const WEEK = [1, 2, 3, 4, 5, 6, 0];

type SlotRow = {
  id: string;
  program_id: string;
  label: string | null;
  location: string | null;
  day_of_week: number;
  start_time: string;
  capacity: number;
  duration_minutes: number | null;
  programs: { name: string } | null;
  pelatih: { full_name: string; title: string | null } | null;
};

export default async function SlotJadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string; program?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [slots, schedules, { data: coaches }, { data: programs }, { data: locations }] = await Promise.all([
    selectAll<SlotRow>(
      supabase,
      "class_slots",
      "id, program_id, label, location, day_of_week, start_time, capacity, duration_minutes, programs:program_id(name), pelatih:pelatih_id(full_name, title)",
      "start_time"
    ),
    selectAll<{ slot_id: string }>(supabase, "schedules", "slot_id"),
    supabase.from("users").select("id, full_name, title").eq("role", "pelatih").eq("active", true).order("full_name"),
    supabase.from("programs").select("id, name").order("name"),
    supabase.from("pool_locations").select("name").order("name"),
  ]);

  const filled = new Map<string, number>();
  for (const s of schedules) filled.set(s.slot_id, (filled.get(s.slot_id) ?? 0) + 1);

  const q = (sp.q ?? "").trim().toLowerCase();
  const list = slots
    .filter((s) => !sp.program || s.program_id === sp.program)
    .filter((s) => !q || [s.programs?.name, s.location, s.label, coachName(s.pelatih)].some((v) => (v ?? "").toLowerCase().includes(q)))
    .sort((a, b) => WEEK.indexOf(a.day_of_week) - WEEK.indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time));

  const canCreate = (coaches?.length ?? 0) > 0 && (programs?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Slot" subtitle="Buat slot kelas. Setiap slot diperiksa terhadap jadwal pengajar dan kolam sebelum disimpan." />

      {sp.error && (
        <p role="alert" className="rounded-xl bg-[#FFF0F3] px-4 py-3 text-sm text-[#7A1B36]">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Tambah slot jadwal</h2>
        <ToastForm action={createSlotAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" pendingLabel="Memeriksa...">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Program</label>
            <GlassSelect name="program_id" required defaultValue="" glassChevron>
              <option value="" disabled>
                Pilih program
              </option>
              {(programs ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Pengajar</label>
            <GlassSelect name="pelatih_id" required defaultValue="" glassChevron>
              <option value="" disabled>
                Pilih pengajar
              </option>
              {(coaches ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {coachName(c)}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Tipe kelas</label>
            <GlassSelect name="label" defaultValue="" glassChevron>
              <option value="">Tanpa label</option>
              <option value="Grup">Grup</option>
              <option value="Private">Private</option>
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Lokasi kolam</label>
            <GlassInput name="location" list="lokasi-kolam" placeholder="Nama kolam" />
            <datalist id="lokasi-kolam">
              {(locations ?? []).map((l) => (
                <option key={l.name} value={l.name} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Hari</label>
            <GlassSelect name="day_of_week" required defaultValue="" glassChevron>
              <option value="" disabled>
                Pilih hari
              </option>
              {WEEK.map((d) => (
                <option key={d} value={d}>
                  {DAYS[d]}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Jam mulai</label>
            <GlassInput name="start_time" type="time" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Durasi (menit)</label>
            <GlassInput name="duration_minutes" type="number" min={15} max={240} step={5} defaultValue={60} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Kapasitas</label>
            <GlassInput name="capacity" type="number" min={1} required />
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="confirm_warnings" className="mt-0.5 h-4 w-4" />
            <span>Saya mengerti peringatan (mis. kolam dipakai kelas lain pada jam yang sama) dan tetap ingin menyimpan.</span>
          </label>

          {!canCreate && (
            <p className="text-sm text-amber-700 sm:col-span-2 lg:col-span-4">
              Butuh minimal satu pengajar dan satu program sebelum membuat slot.
            </p>
          )}
          <div className="sm:col-span-2 lg:col-span-4">
            <GlassButton type="submit" disabled={!canCreate} className={`${ADMIN_CTA} px-6 py-2.5 text-sm`}>
              Periksa &amp; tambah slot
            </GlassButton>
          </div>
        </ToastForm>
      </GlassCard>

      <FilterBar action="/admin/slot-jadwal">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
          Cari
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Program, pengajar, atau lokasi" className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Program
          <select name="program" defaultValue={sp.program ?? ""} className={FIELD_CLASS}>
            <option value="">Semua program</option>
            {(programs ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
          Terapkan
        </GlassButton>
        {(sp.q || sp.program) && (
          <Link href="/admin/slot-jadwal" className="min-h-10 self-center text-sm font-semibold text-[#0B6470] hover:underline">
            Reset
          </Link>
        )}
      </FilterBar>

      {list.length === 0 ? (
        <EmptyState
          title={slots.length === 0 ? "Belum ada slot jadwal." : "Tidak ada slot yang cocok."}
          hint={slots.length === 0 ? "Isi formulir di atas untuk membuat slot pertama." : "Ubah atau reset filter."}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((s) => {
            const n = filled.get(s.id) ?? 0;
            const fill = slotFill(n, s.capacity);
            return (
              <div key={s.id} className="flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#17263D]">
                    {dayName(s.day_of_week)} · {formatRange(s.start_time, s.duration_minutes ?? 60)} · {s.programs?.name}
                    {s.label ? ` ${s.label}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.location ?? "Lokasi belum diisi"} · {coachName(s.pelatih)} · {n}/{s.capacity} peserta
                  </p>
                  <div className="mt-1">
                    <Badge tone={FILL_TONE[fill]}>{FILL_LABEL[fill]}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/jadwal/${s.id}`} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
                    Kelola sesi
                  </Link>
                  <ToastForm action={deleteSlotAction} className="flex items-center" pendingLabel="Menghapus...">
                    <input type="hidden" name="id" value={s.id} />
                    <ImpactConfirm
                      label="Hapus"
                      title={`Hapus slot ${dayName(s.day_of_week)} ${s.start_time.slice(0, 5)} ${s.programs?.name ?? ""}?`}
                      impacts={
                        n > 0
                          ? [`Slot ini masih berisi ${n} peserta. Pindahkan atau keluarkan mereka lebih dulu; slot tidak dapat dihapus selama masih berisi.`]
                          : ["Slot kosong ini dihapus dari jadwal.", "Riwayat perubahan slot tetap tercatat.", "Tindakan ini tidak dapat dibatalkan."]
                      }
                      destructive
                      confirmLabel={n > 0 ? "Coba hapus" : "Ya, hapus slot"}
                    />
                  </ToastForm>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
