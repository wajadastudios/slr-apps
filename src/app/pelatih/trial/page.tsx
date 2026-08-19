import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { DataRow } from "@/components/ui/data-row";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function PelatihTrialPage() {
  const session = await getUserWithRole();
  if (!session || session.role !== "pelatih") redirect("/login");

  const supabase = await createClient();

  const { data: trials } = await supabase
    .from("registrations")
    .select(
      "id, child_name, trial_session_date, trial_session_time, trial_location, trial_fee_status, program:program_id(name)"
    )
    .eq("trial_pelatih_id", session.user.id)
    .not("trial_session_date", "is", null)
    .order("trial_session_date")
    .order("trial_session_time");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
          Jadwal Trial
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Sesi trial yang diatur admin untuk Anda ajarkan — peserta belum
          punya akun siswa, jadi sesi ini terpisah dari kalender kelas
          reguler.
        </p>
      </div>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Semua Sesi Trial</h2>
        <div className="flex flex-col gap-2">
          {(!trials || trials.length === 0) && (
            <p className="text-sm text-slate-600">
              Belum ada sesi trial yang dijadwalkan untuk Anda.
            </p>
          )}
          {trials?.map((t) => {
            const program = t.program as unknown as { name: string } | null;
            return (
              <DataRow
                key={t.id}
                primary={
                  <>
                    {t.child_name} &middot; {program?.name ?? "-"}
                  </>
                }
                secondary={
                  <>
                    {t.trial_session_date} pukul{" "}
                    {String(t.trial_session_time).slice(0, 5)}
                    {t.trial_location ? ` · ${t.trial_location}` : ""}
                  </>
                }
                action={
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      t.trial_fee_status === "paid"
                        ? "bg-[#55D6A6]/20 text-[#1a8f6f]"
                        : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {t.trial_fee_status === "paid"
                      ? "Terkonfirmasi"
                      : "Menunggu Pembayaran"}
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
