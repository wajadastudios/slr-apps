import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { DataRow } from "@/components/ui/data-row";
import { DAYS } from "@/lib/days";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Menunggu", className: "bg-amber-500/15 text-amber-700" },
  approved: { label: "Disetujui", className: "bg-[#55D6A6]/20 text-[#1a8f6f]" },
  rejected: { label: "Ditolak", className: "bg-red-500/15 text-red-700" },
};

export default async function AdminPenggantiPage() {
  const supabase = await createClient();

  const [{ data: requests }, { data: pelatihNames }] = await Promise.all([
    supabase
      .from("substitution_requests")
      .select(
        "id, session_date, status, access_until, created_at, decided_at, requester_id, approved_by, slot:slot_id(pelatih_id, day_of_week, start_time, label, programs:program_id(name))"
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("get_public_pelatih_names"),
  ]);

  const nameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) nameById.set(p.id, p.full_name);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={HEADING}>Riwayat Pengajar Pengganti</h2>
        <p className="mt-1 text-sm text-slate-600">
          Setiap permintaan akses tercatat di sini — siapa menggantikan siapa,
          untuk sesi mana, dan siapa yang menyetujui. Akses berakhir otomatis
          7 hari setelah tanggal sesi; laporan yang sudah ditulis tetap
          tersimpan permanen.
        </p>
      </GlassCard>

      <GlassCard>
        <div className="flex flex-col gap-2">
          {(!requests || requests.length === 0) && (
            <p className="text-sm text-slate-600">
              Belum ada permintaan pengajar pengganti.
            </p>
          )}
          {requests?.map((r) => {
            const slot = r.slot as unknown as {
              pelatih_id: string;
              day_of_week: number;
              start_time: string;
              label: string | null;
              programs: { name: string } | null;
            } | null;
            const status = STATUS[r.status] ?? {
              label: r.status,
              className: "bg-slate-200 text-slate-700",
            };

            return (
              <DataRow
                key={r.id}
                primary={
                  <>
                    {nameById.get(r.requester_id) ?? "Pengajar"} &rarr;
                    menggantikan{" "}
                    {slot ? nameById.get(slot.pelatih_id) ?? "-" : "-"}
                  </>
                }
                secondary={
                  <>
                    {slot ? DAYS[slot.day_of_week] : "-"}, {r.session_date}
                    {slot ? ` · ${String(slot.start_time).slice(0, 5)}` : ""} ·{" "}
                    {slot?.programs?.name ?? "-"}
                    {r.approved_by
                      ? ` · diputuskan oleh ${nameById.get(r.approved_by) ?? "admin"}`
                      : ""}
                    {r.access_until ? ` · akses s/d ${r.access_until}` : ""}
                  </>
                }
                action={
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                }
              />
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
