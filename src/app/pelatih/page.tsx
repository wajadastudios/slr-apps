import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { DAYS } from "@/lib/days";

export default async function PelatihDashboardPage() {
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("schedules")
    .select(
      "id, student:student_id(id, full_name), slot:slot_id(label, day_of_week, start_time, programs:program_id(name))"
    );

  type Row = {
    id: string;
    student: { id: string; full_name: string } | null;
    slot: {
      label: string | null;
      day_of_week: number;
      start_time: string;
      programs: { name: string } | null;
    } | null;
  };

  const rows = (enrollments ?? []) as unknown as Row[];
  const sorted = [...rows].sort((a, b) => {
    const dayDiff = (a.slot?.day_of_week ?? 0) - (b.slot?.day_of_week ?? 0);
    if (dayDiff !== 0) return dayDiff;
    return (a.slot?.start_time ?? "").localeCompare(b.slot?.start_time ?? "");
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        Jadwal Mengajar
      </h1>

      {sorted.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Belum ada murid yang dijadwalkan untuk Anda.
          </p>
        </GlassCard>
      )}

      {sorted.map((row) => (
        <GlassCard key={row.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                {row.slot ? DAYS[row.slot.day_of_week] : "-"}
                {row.slot ? `, ${row.slot.start_time}` : ""} &mdash;{" "}
                {row.slot?.programs?.name}
                {row.slot?.label ? ` (${row.slot.label})` : ""}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {row.student?.full_name}
              </p>
            </div>
            {row.student && (
              <Link href={`/pelatih/murid/${row.student.id}`}>
                <span className="rounded-2xl border border-white/30 bg-white/30 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur-xl transition-all hover:bg-white/40 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
                  Isi Laporan
                </span>
              </Link>
            )}
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
