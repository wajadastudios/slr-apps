import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { loadMilestones } from "@/lib/milestone-loader";
import { computeAwards } from "@/lib/milestones";
import { MilestoneWorkspace } from "./milestone-workspace";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function MilestonePage({
  searchParams,
}: {
  searchParams: Promise<{ sel?: string }>;
}) {
  const { sel } = await searchParams;
  const supabase = await createClient();

  const { error: tableError } = await supabase.from("milestones").select("id").limit(1);
  const milestones = await loadMilestones(supabase);

  // Frozen awards count as-is; records saved before milestones were editable
  // (awards null) are evaluated against the current targets, same as the badges.
  const { data: recordRows } = await supabase.from("performance_records").select("*");
  const usage = new Map<string, number>();
  for (const row of recordRows ?? []) {
    const awards =
      (row.awards as Record<string, string> | null) ??
      computeAwards(
        {
          metric_type: row.metric_type,
          stroke: row.stroke,
          distance_m: row.distance_m === null ? null : Number(row.distance_m),
          duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
        },
        milestones
      );
    for (const id of Object.keys(awards)) usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  if (tableError) {
    return (
      <GlassCard>
        <h2 className={`mb-2 ${HEADING}`}>Milestone</h2>
        <p className="text-sm text-slate-700">
          Tabel milestone belum ada di database. Jalankan migrasi{" "}
          <code>0031_milestones_and_record_ownership.sql</code> di Supabase SQL Editor terlebih
          dahulu.
        </p>
      </GlassCard>
    );
  }

  const items = milestones.map((m) => ({ ...m, used: usage.get(m.id) ?? 0 }));
  const levels = [...new Set(milestones.map((m) => m.level))];

  return (
    <div className="flex flex-col gap-4">
      <GlassCard>
        <h1 className={`mb-1 ${HEADING}`}>Milestone Siswa</h1>
        <p className="text-sm text-slate-600">
          Target rekor performa yang membuka lencana perunggu, perak, atau emas. Yang tampil di
          akun orang tua dan pengajar adalah milestone yang aktif.
        </p>
        <details className="group mt-2 rounded-xl border border-[#35C5D0]/30 bg-[#EEF9FB] px-3 py-2 text-sm text-slate-700">
          <summary className="cursor-pointer select-none font-semibold text-[#17263D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]/70">
            Aturan lencana
          </summary>
          <p className="mt-2">
            Lencana ditentukan <strong>saat rekor disimpan</strong>, berdasarkan target yang
            berlaku pada saat itu. Mengubah target hanya berlaku untuk rekor yang disimpan
            sesudahnya &mdash; lencana yang sudah diperoleh siswa tidak akan hilang. Milestone yang
            sudah menghasilkan lencana tidak bisa dihapus (cukup dinonaktifkan) dan metrik, gaya,
            serta jaraknya terkunci.
          </p>
        </details>
      </GlassCard>

      <MilestoneWorkspace milestones={items} levels={levels} focusId={sel} />
    </div>
  );
}
