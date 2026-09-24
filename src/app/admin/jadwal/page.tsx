import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Badge, EmptyState, FIELD_CLASS, FilterBar, PageHeader, TabLinks, type Tone } from "@/components/admin/ui";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { selectAll } from "@/lib/admin/load";
import { existingConflicts, type SlotContext } from "@/lib/admin/schedule-rules";
import { dayName, formatClock, formatRange, slotFill, FILL_LABEL, type SlotFill } from "@/lib/admin/format";
import { DAYS } from "@/lib/days";

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const FILL_TONE: Record<SlotFill, Tone> = { penuh: "danger", hampir_penuh: "warn", terisi_sebagian: "info", tersedia: "ok" };
const MAX_NAMES = 3;
const PAGE = 40;

type SlotRow = {
  id: string;
  program_id: string;
  pelatih_id: string;
  label: string | null;
  location: string | null;
  day_of_week: number;
  start_time: string;
  capacity: number;
  duration_minutes: number | null;
  programs: { name: string } | null;
  pelatih: { full_name: string; title: string | null } | null;
};

type ScheduleRow = {
  id: string;
  slot_id: string;
  student: { id: string; full_name: string } | null;
};

type Params = {
  tampilan?: string;
  q?: string;
  program?: string;
  hari?: string;
  pelatih?: string;
  filter?: string;
  limit?: string;
  error?: string;
};

export default async function JadwalPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const view = sp.tampilan === "peserta" ? "peserta" : "sesi";
  const supabase = await createClient();

  const [slots, schedules, { data: programs }, { data: coaches }] = await Promise.all([
    selectAll<SlotRow>(
      supabase,
      "class_slots",
      "id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes, programs:program_id(name), pelatih:pelatih_id(full_name, title)",
      "start_time"
    ),
    selectAll<ScheduleRow>(supabase, "schedules", "id, slot_id, student:student_id(id, full_name)"),
    supabase.from("programs").select("id, name").order("name"),
    supabase.from("users").select("id, full_name, title").eq("role", "pelatih").order("full_name"),
  ]);

  const byStudent = new Map<string, ScheduleRow[]>();
  const bySlot = new Map<string, ScheduleRow[]>();
  for (const s of schedules) {
    const list = bySlot.get(s.slot_id) ?? [];
    list.push(s);
    bySlot.set(s.slot_id, list);
  }

  const contexts: SlotContext[] = slots.map((s) => ({
    id: s.id,
    program_id: s.program_id,
    pelatih_id: s.pelatih_id,
    location: s.location,
    day_of_week: s.day_of_week,
    start_time: s.start_time,
    duration_minutes: s.duration_minutes ?? 60,
    capacity: s.capacity,
    programName: s.programs?.name ?? "Program",
    pelatihName: s.pelatih ? (s.pelatih.title ? `${s.pelatih.title} ${s.pelatih.full_name}` : s.pelatih.full_name) : "-",
  }));
  const conflicts = existingConflicts(contexts);
  const conflictIds = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));
  // The badge used to just say "Ada konflik jadwal" with no reason -- build
  // one human-readable line per conflicting pair, from each slot's own side,
  // naming the other slot and why (same pengajar vs same lokasi).
  const conflictReasonsBySlot = new Map<string, string[]>();
  const addReason = (slotId: string, other: SlotContext, kind: "pelatih" | "location") => {
    const list = conflictReasonsBySlot.get(slotId) ?? [];
    const otherLabel = `${other.programName} · ${dayName(other.day_of_week)} ${formatClock(other.start_time)}`;
    list.push(
      kind === "pelatih"
        ? `${other.pelatihName} juga mengajar ${otherLabel}`
        : `Lokasi "${other.location}" juga dipakai untuk ${otherLabel}`
    );
    conflictReasonsBySlot.set(slotId, list);
  };
  for (const c of conflicts) {
    addReason(c.a.id, c.b, c.kind);
    addReason(c.b.id, c.a, c.kind);
  }

  const q = (sp.q ?? "").trim().toLowerCase();
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);
  const coachLabel = (s: SlotRow) => (s.pelatih ? (s.pelatih.title ? `${s.pelatih.title} ${s.pelatih.full_name}` : s.pelatih.full_name) : "-");

  const tabs = [
    { key: "sesi", label: "Per Sesi", href: "/admin/jadwal" },
    { key: "peserta", label: "Per Peserta", href: "/admin/jadwal?tampilan=peserta" },
  ];

  const filters = (
    <FilterBar action="/admin/jadwal">
      <input type="hidden" name="tampilan" value={view} />
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
        Cari
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={view === "peserta" ? "Nama peserta atau program" : "Program, pengajar, lokasi, atau peserta"}
          className={FIELD_CLASS}
        />
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
      {view === "sesi" && (
        <>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Hari
            <select name="hari" defaultValue={sp.hari ?? ""} className={FIELD_CLASS}>
              <option value="">Semua hari</option>
              {WEEK.map((d) => (
                <option key={d} value={d}>
                  {DAYS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Pengajar
            <select name="pelatih" defaultValue={sp.pelatih ?? ""} className={FIELD_CLASS}>
              <option value="">Semua pengajar</option>
              {(coaches ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ? `${c.title} ${c.full_name}` : c.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Status
            <select name="filter" defaultValue={sp.filter ?? ""} className={FIELD_CLASS}>
              <option value="">Semua</option>
              <option value="tersedia">Tersedia</option>
              <option value="terisi_sebagian">Terisi sebagian</option>
              <option value="hampir_penuh">Hampir penuh</option>
              <option value="penuh">Penuh</option>
              <option value="konflik">Ada konflik</option>
            </select>
          </label>
        </>
      )}
      <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
        Terapkan
      </GlassButton>
      {(sp.q || sp.program || sp.hari || sp.pelatih || sp.filter) && (
        <Link href={`/admin/jadwal?tampilan=${view}`} className="min-h-10 self-center text-sm font-semibold text-[#0B6470] hover:underline">
          Reset
        </Link>
      )}
    </FilterBar>
  );

  // ---------------- per participant ----------------
  if (view === "peserta") {
    for (const s of schedules) {
      if (!s.student) continue;
      const list = byStudent.get(s.student.id) ?? [];
      list.push(s);
      byStudent.set(s.student.id, list);
    }
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const people = [...byStudent.entries()]
      .map(([id, rows]) => ({ id, name: rows[0].student?.full_name ?? "Peserta", rows }))
      .filter((p) => !sp.program || p.rows.some((r) => slotById.get(r.slot_id)?.program_id === sp.program))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.rows.some((r) => (slotById.get(r.slot_id)?.programs?.name ?? "").toLowerCase().includes(q))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    const shown = people.slice(0, limit);

    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Jadwal" subtitle="Cari satu peserta untuk melihat atau mengubah jadwalnya." />
        <TabLinks tabs={tabs} active={view} label="Tampilan jadwal" />
        {filters}
        {sp.error && <p role="alert" className="text-sm text-red-700">{decodeURIComponent(sp.error)}</p>}
        {shown.length === 0 ? (
          <EmptyState title="Tidak ada peserta terjadwal yang cocok." hint="Tambahkan peserta ke sesi dari halaman sesi (tab Per Sesi → Lihat roster)." />
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((p) => (
              <GlassCard key={p.id} className="flex flex-col gap-2 !p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/murid/${p.id}?tab=jadwal`} className="text-sm font-semibold text-[#17263D] hover:underline">
                    {p.name}
                  </Link>
                  <Link href={`/admin/murid/${p.id}?tab=jadwal`} className="text-xs font-semibold text-[#0B6470] hover:underline">
                    Buka detail peserta
                  </Link>
                </div>
                <ul className="flex flex-col gap-1">
                  {p.rows.map((r) => {
                    const s = slotById.get(r.slot_id);
                    if (!s) return null;
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/admin/jadwal/${s.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/60 px-3 py-2 text-sm hover:bg-[#0E7C89]/10"
                        >
                          <span>
                            {dayName(s.day_of_week)} · {formatRange(s.start_time, s.duration_minutes ?? 60)} · {s.programs?.name} ·{" "}
                            {s.location ?? "Lokasi belum diisi"}
                          </span>
                          <span className="text-xs text-slate-500">{coachLabel(s)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------------- per session (default) ----------------
  const filtered = slots
    .filter((s) => !sp.program || s.program_id === sp.program)
    .filter((s) => sp.hari === undefined || sp.hari === "" || s.day_of_week === Number(sp.hari))
    .filter((s) => !sp.pelatih || s.pelatih_id === sp.pelatih)
    .filter((s) => {
      const fill = slotFill((bySlot.get(s.id) ?? []).length, s.capacity);
      if (sp.filter === "konflik") return conflictIds.has(s.id);
      if (sp.filter === "tersedia" || sp.filter === "hampir_penuh" || sp.filter === "terisi_sebagian" || sp.filter === "penuh") return fill === sp.filter;
      return true;
    })
    .filter((s) => {
      if (!q) return true;
      const names = (bySlot.get(s.id) ?? []).map((r) => r.student?.full_name ?? "");
      return [s.programs?.name, s.location, coachLabel(s), s.label, ...names].some((v) => (v ?? "").toLowerCase().includes(q));
    })
    .sort((a, b) => WEEK.indexOf(a.day_of_week) - WEEK.indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time));

  const shown = filtered.slice(0, limit);
  const days = WEEK.filter((d) => shown.some((s) => s.day_of_week === d));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Jadwal"
        subtitle="Satu sesi kelas tampil satu kali, lengkap dengan pesertanya."
        actions={
          <Link href="/admin/slot-jadwal" className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}>
            Tambah slot baru
          </Link>
        }
      />
      <TabLinks tabs={tabs} active={view} label="Tampilan jadwal" />
      {filters}
      {sp.error && <p role="alert" className="text-sm text-red-700">{decodeURIComponent(sp.error)}</p>}

      {shown.length === 0 ? (
        <EmptyState
          title={slots.length === 0 ? "Belum ada slot jadwal." : "Tidak ada sesi yang cocok dengan filter."}
          hint={slots.length === 0 ? "Buat slot pertama agar peserta dapat dijadwalkan." : "Ubah atau reset filter."}
          action={
            slots.length === 0 ? (
              <Link href="/admin/slot-jadwal" className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}>
                Buat slot
              </Link>
            ) : undefined
          }
        />
      ) : (
        days.map((d) => (
          <section key={d} className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">{DAYS[d]}</h2>
            {shown
              .filter((s) => s.day_of_week === d)
              .map((s) => {
                const people = bySlot.get(s.id) ?? [];
                const fill = slotFill(people.length, s.capacity);
                const names = people.map((p) => p.student?.full_name ?? "Peserta");
                return (
                  <div key={s.id} className="flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#17263D]">
                        {dayName(s.day_of_week)} · {formatClock(s.start_time)} · {s.programs?.name}
                        {s.label ? ` ${s.label}` : ""} · {s.location ?? "Lokasi belum diisi"} · {coachLabel(s)} ·{" "}
                        {people.length}/{s.capacity} peserta
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={FILL_TONE[fill]}>{FILL_LABEL[fill]}</Badge>
                        {conflictIds.has(s.id) && <Badge tone="danger">Ada konflik jadwal</Badge>}
                        <span className="text-xs text-slate-600">
                          {names.length === 0
                            ? "Belum ada peserta"
                            : `${names.slice(0, MAX_NAMES).join(", ")}${names.length > MAX_NAMES ? ` +${names.length - MAX_NAMES} peserta` : ""}`}
                        </span>
                      </div>
                      {conflictReasonsBySlot.has(s.id) && (
                        <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[#A3183C]">
                          {conflictReasonsBySlot.get(s.id)!.map((reason, i) => (
                            <li key={i}>&bull; {reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Link
                      href={`/admin/jadwal/${s.id}`}
                      className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}
                    >
                      Lihat roster
                    </Link>
                  </div>
                );
              })}
          </section>
        ))
      )}

      {filtered.length > shown.length && (
        <Link
          href={`/admin/jadwal?${new URLSearchParams({ q: sp.q ?? "", program: sp.program ?? "", hari: sp.hari ?? "", pelatih: sp.pelatih ?? "", filter: sp.filter ?? "", limit: String(limit + PAGE) }).toString()}`}
          className={`inline-flex min-h-11 w-fit items-center rounded-2xl border px-5 text-sm font-semibold ${SECONDARY_BUTTON}`}
        >
          Tampilkan lebih banyak ({filtered.length - shown.length} sesi lagi)
        </Link>
      )}
    </div>
  );
}
