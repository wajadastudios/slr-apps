import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
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
    <div className="flex flex-col gap-4">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Jadwal Mengajar
      </h1>

      <GlassCard>
        {sorted.length === 0 && (
          <p className="text-sm text-slate-600">
            Belum ada murid yang dijadwalkan untuk Anda.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {sorted.map((row) => (
            <DataRow
              key={row.id}
              primary={
                <>
                  {row.slot ? DAYS[row.slot.day_of_week] : "-"}
                  {row.slot ? `, ${row.slot.start_time}` : ""} &mdash;{" "}
                  {row.slot?.programs?.name}
                  {row.slot?.label ? ` (${row.slot.label})` : ""}
                </>
              }
              secondary={row.student?.full_name}
              action={
                row.student && (
                  <Link href={`/pelatih/murid/${row.student.id}`}>
                    <GlassButton className="px-4 py-2 text-sm">
                      Isi Laporan
                    </GlassButton>
                  </Link>
                )
              }
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
