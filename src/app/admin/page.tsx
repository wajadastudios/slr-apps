import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";

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

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [pelatih, ortu, murid, program, slotJadwal, jadwal] = await Promise.all([
    countRows(supabase, "users", { role: "pelatih" }),
    countRows(supabase, "users", { role: "ortu" }),
    countRows(supabase, "students", { active: true }),
    countRows(supabase, "programs"),
    countRows(supabase, "class_slots"),
    countRows(supabase, "schedules"),
  ]);

  const tiles = [
    { label: "Pelatih", value: pelatih },
    { label: "Orang Tua", value: ortu },
    { label: "Murid Aktif", value: murid },
    { label: "Program", value: program },
    { label: "Slot Jadwal", value: slotJadwal },
    { label: "Murid Terjadwal", value: jadwal },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <GlassCard key={tile.label} className="text-center">
          <p className="font-[family-name:var(--font-quicksand)] text-3xl font-bold text-[#35C5D0]">
            {tile.value}
          </p>
          <p className="mt-1 text-sm text-slate-700">{tile.label}</p>
        </GlassCard>
      ))}
    </div>
  );
}
