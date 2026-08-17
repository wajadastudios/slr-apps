import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { DataRow } from "@/components/ui/data-row";
import { DAYS } from "@/lib/days";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

async function countRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  match?: Record<string, unknown>
) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (match) {
    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value);
    }
  }
  const { count } = await query;
  return count ?? 0;
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

type SlotRow = {
  id: string;
  label: string | null;
  location: string | null;
  day_of_week: number;
  start_time: string;
  capacity: number;
  program_id: string;
  programs: { name: string } | null;
  pelatih: { full_name: string; title: string | null } | null;
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    pelatihCount,
    ortuCount,
    muridCount,
    programCount,
    { data: slots },
    { data: enrollments },
    { data: invoices },
    { data: reportsThisWeek },
    { data: pendingRegistrations },
  ] = await Promise.all([
    countRows(supabase, "users", { role: "pelatih" }),
    countRows(supabase, "users", { role: "ortu" }),
    countRows(supabase, "students", { active: true }),
    countRows(supabase, "programs", { active: true }),
    supabase
      .from("class_slots")
      .select(
        "id, label, location, day_of_week, start_time, capacity, program_id, programs:program_id(name), pelatih:pelatih_id(full_name, title)"
      )
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("schedules")
      .select("slot_id, student:student_id(id, full_name, active)"),
    supabase
      .from("invoices")
      .select("student_id, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("progress_reports")
      .select("student_id")
      .gte("session_date", startOfWeek(new Date()).toISOString().slice(0, 10)),
    supabase.from("registrations").select("id").eq("status", "pending"),
  ]);

  const pelatihLabel = (p: { full_name: string; title: string | null } | null) =>
    p ? (p.title ? `${p.title} ${p.full_name}` : p.full_name) : "-";

  // students enrolled per slot (active only)
  const studentsBySlot = new Map<
    string,
    { id: string; full_name: string }[]
  >();
  for (const e of enrollments ?? []) {
    const student = e.student as unknown as {
      id: string;
      full_name: string;
      active: boolean;
    } | null;
    if (!student || !student.active) continue;
    const list = studentsBySlot.get(e.slot_id) ?? [];
    list.push({ id: student.id, full_name: student.full_name });
    studentsBySlot.set(e.slot_id, list);
  }

  // latest invoice status per student
  const latestInvoiceStatus = new Map<string, string>();
  for (const inv of invoices ?? []) {
    if (!latestInvoiceStatus.has(inv.student_id)) {
      latestInvoiceStatus.set(inv.student_id, inv.status);
    }
  }

  const reportedThisWeek = new Set(
    (reportsThisWeek ?? []).map((r) => r.student_id)
  );

  // roster: program name -> class type label -> { pelatih:Set, students:Set }
  const roster = new Map<
    string,
    Map<string, { pelatih: Set<string>; students: Map<string, string> }>
  >();
  // slot summary rows for quota/payment section
  const slotSummaries: {
    id: string;
    label: string;
    location: string | null;
    filled: number;
    capacity: number;
    belumBayar: number;
    dayTime: string;
  }[] = [];

  const missingReportStudents = new Map<string, string>();

  for (const s of (slots as SlotRow[] | null) ?? []) {
    const programName = s.programs?.name ?? "Program";
    const classType = s.label ?? "Umum";
    const pelatihName = pelatihLabel(s.pelatih);
    const students = studentsBySlot.get(s.id) ?? [];

    if (!roster.has(programName)) roster.set(programName, new Map());
    const byType = roster.get(programName)!;
    if (!byType.has(classType))
      byType.set(classType, { pelatih: new Set(), students: new Map() });
    const bucket = byType.get(classType)!;
    bucket.pelatih.add(pelatihName);
    for (const st of students) {
      bucket.students.set(st.id, st.full_name);
      if (!reportedThisWeek.has(st.id)) {
        missingReportStudents.set(st.id, st.full_name);
      }
    }

    const belumBayar = students.filter(
      (st) => latestInvoiceStatus.get(st.id) === "sent"
    ).length;

    slotSummaries.push({
      id: s.id,
      label: `${programName}${s.label ? ` (${s.label})` : ""}`,
      location: s.location,
      filled: students.length,
      capacity: s.capacity,
      belumBayar,
      dayTime: `${DAYS[s.day_of_week]}, ${s.start_time}`,
    });
  }

  // weekly grid: day_of_week -> sorted slot cells
  const gridByDay = new Map<number, SlotRow[]>();
  for (const s of (slots as SlotRow[] | null) ?? []) {
    const list = gridByDay.get(s.day_of_week) ?? [];
    list.push(s);
    gridByDay.set(s.day_of_week, list);
  }

  const tiles = [
    { label: "Pengajar", value: pelatihCount },
    { label: "Orang Tua", value: ortuCount },
    { label: "Siswa Aktif", value: muridCount },
    { label: "Program Aktif", value: programCount },
  ];

  const pendingCount = pendingRegistrations?.length ?? 0;
  const missingReportList = Array.from(missingReportStudents.values());
  const nearCapacitySlots = slotSummaries.filter(
    (s) => s.capacity > 0 && s.filled / s.capacity >= 0.8
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <GlassCard key={tile.label} className="text-center">
            <p className="font-[family-name:var(--font-quicksand)] text-3xl font-bold text-[#35C5D0]">
              {tile.value}
            </p>
            <p className="mt-1 text-sm text-slate-700">{tile.label}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/pendaftar">
          <GlassCard className="text-center transition-colors hover:bg-white/60">
            <p className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
              {pendingCount}
            </p>
            <p className="mt-1 text-sm text-slate-700">Pendaftar Menunggu</p>
          </GlassCard>
        </Link>
        <GlassCard className="text-center">
          <p className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
            {missingReportList.length}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Laporan Belum Diisi Minggu Ini
          </p>
        </GlassCard>
        <GlassCard className="text-center">
          <p className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
            {nearCapacitySlots.length}
          </p>
          <p className="mt-1 text-sm text-slate-700">Slot &ge;80% Kapasitas</p>
        </GlassCard>
      </div>

      {missingReportList.length > 0 && (
        <GlassCard>
          <h2 className={`mb-3 ${HEADING}`}>Laporan Belum Diisi Minggu Ini</h2>
          <div className="flex flex-wrap gap-2">
            {missingReportList.map((name, i) => (
              <span
                key={i}
                className="rounded-full border border-white/30 bg-white/40 px-3 py-1 text-xs text-slate-700"
              >
                {name}
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Siswa & Pengajar per Program</h2>
        <div className="flex flex-col gap-5">
          {roster.size === 0 && (
            <p className="text-sm text-slate-600">Belum ada slot jadwal.</p>
          )}
          {Array.from(roster.entries()).map(([programName, byType]) => (
            <div key={programName}>
              <p className="mb-2 font-[family-name:var(--font-quicksand)] font-bold text-[#17263D]">
                {programName}
              </p>
              <div className="flex flex-col gap-2">
                {Array.from(byType.entries()).map(([classType, bucket]) => (
                  <DataRow
                    key={classType}
                    primary={`${classType} · ${bucket.students.size} siswa`}
                    secondary={`Pengajar: ${Array.from(bucket.pelatih).join(", ")}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Kuota & Status Pembayaran per Kelas</h2>
        <div className="flex flex-col gap-2">
          {slotSummaries.length === 0 && (
            <p className="text-sm text-slate-600">Belum ada slot jadwal.</p>
          )}
          {slotSummaries.map((s) => {
            const full = s.filled >= s.capacity;
            const nearCapacity = !full && s.filled / s.capacity >= 0.8;
            return (
              <DataRow
                key={s.id}
                primary={`${s.dayTime} — ${s.label}`}
                secondary={
                  <>
                    {s.location ? `${s.location} · ` : ""}
                    <span className={full ? "text-red-700" : nearCapacity ? "text-amber-700" : ""}>
                      terisi {s.filled}/{s.capacity}
                    </span>
                    {s.belumBayar > 0 && (
                      <span className="text-amber-700">
                        {" "}
                        · {s.belumBayar} belum bayar
                      </span>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Jadwal Mingguan</h2>
        <div className="grid gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-7">
          {WEEK_DISPLAY_ORDER.map((dayIdx) => {
            const daySlots = (gridByDay.get(dayIdx) ?? []).slice().sort((a, b) =>
              a.start_time.localeCompare(b.start_time)
            );
            return (
              <div key={dayIdx} className="min-w-[160px]">
                <p className="mb-2 text-center text-sm font-bold text-[#17263D]">
                  {DAYS[dayIdx]}
                </p>
                <div className="flex flex-col gap-2">
                  {daySlots.length === 0 && (
                    <p className="text-center text-xs text-slate-500">-</p>
                  )}
                  {daySlots.map((s) => {
                    const students = studentsBySlot.get(s.id) ?? [];
                    return (
                      <div
                        key={s.id}
                        className="rounded-lg border border-white/30 bg-white/40 p-2 text-xs"
                      >
                        <p className="font-medium text-[#17263D]">
                          {s.start_time} — {s.programs?.name}
                          {s.label ? ` (${s.label})` : ""}
                        </p>
                        <p className="mt-0.5 text-slate-600">
                          {students.length > 0
                            ? students.map((st) => st.full_name).join(", ")
                            : "Belum ada siswa"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
