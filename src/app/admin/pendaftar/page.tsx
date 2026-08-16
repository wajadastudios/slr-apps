import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { approveRegistrationAction, rejectRegistrationAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export default async function PendaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: registrations } = await supabase
    .from("registrations")
    .select(
      "id, child_name, parent_name, parent_email, parent_phone, preferred_schedule, status, created_at, program:program_id(name)"
    )
    .order("created_at", { ascending: false });

  const pending = (registrations ?? []).filter((r) => r.status === "pending");
  const others = (registrations ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm text-red-700 dark:text-red-300">
          {decodeURIComponent(error)}
        </p>
      )}

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Menunggu Persetujuan
        </h2>
        <div className="flex flex-col gap-4">
          {pending.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Tidak ada pendaftar baru.
            </p>
          )}
          {pending.map((r) => {
            const program = r.program as unknown as { name: string } | null;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-white/20 bg-white/10 p-4"
              >
                <p className="font-medium text-slate-900 dark:text-white">
                  {r.child_name} &middot; {program?.name ?? "-"}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Orang tua: {r.parent_name} ({r.parent_email}
                  {r.parent_phone ? `, ${r.parent_phone}` : ""})
                </p>
                {r.preferred_schedule && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Jadwal diminati: {r.preferred_schedule}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <form
                    action={approveRegistrationAction}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="registration_id" value={r.id} />
                    <input type="hidden" name="full_name" value={r.parent_name} />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-700 dark:text-slate-300">
                        Email Akun
                      </label>
                      <GlassInput
                        name="email"
                        type="email"
                        defaultValue={r.parent_email}
                        required
                        className="w-48"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-700 dark:text-slate-300">
                        Password Awal
                      </label>
                      <GlassInput
                        name="password"
                        type="text"
                        required
                        minLength={6}
                        className="w-40"
                      />
                    </div>
                    <GlassButton type="submit" className="px-4 py-2 text-sm">
                      Setujui &amp; Buat Akun
                    </GlassButton>
                  </form>

                  <form action={rejectRegistrationAction}>
                    <input type="hidden" name="registration_id" value={r.id} />
                    <GlassButton type="submit" className="px-4 py-2 text-sm">
                      Tolak
                    </GlassButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Riwayat Pendaftar
        </h2>
        <div className="flex flex-col gap-2">
          {others.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada.
            </p>
          )}
          {others.map((r) => {
            const program = r.program as unknown as { name: string } | null;
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5"
              >
                <span className="font-medium text-slate-900 dark:text-white">
                  {r.child_name} &middot; {program?.name ?? "-"}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
