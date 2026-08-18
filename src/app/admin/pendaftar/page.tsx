import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import {
  approveRegistrationAction,
  rejectRegistrationAction,
  markTrialPaidAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

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
      "id, child_name, parent_name, parent_email, parent_phone, preferred_schedule, status, trial_fee_status, payment_method, created_at, program:program_id(name)"
    )
    .order("created_at", { ascending: false });

  const pending = (registrations ?? []).filter((r) => r.status === "pending");
  const others = (registrations ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
      )}

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Menunggu Persetujuan</h2>
        <div className="flex flex-col gap-3">
          {pending.length === 0 && (
            <p className="text-sm text-slate-600">Tidak ada pendaftar baru.</p>
          )}
          {pending.map((r) => {
            const program = r.program as unknown as { name: string } | null;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-white/30 bg-white/40 p-4"
              >
                <p className="font-medium text-[#17263D]">
                  {r.child_name} &middot; {program?.name ?? "-"}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.trial_fee_status === "paid"
                        ? "bg-[#55D6A6]/20 text-[#1a8f6f]"
                        : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {r.trial_fee_status === "paid"
                      ? "Sudah Bayar"
                      : "Belum Bayar"}
                    {r.payment_method ? ` (${r.payment_method})` : ""}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Orang tua: {r.parent_name} ({r.parent_email}
                  {r.parent_phone ? `, ${r.parent_phone}` : ""})
                </p>
                {r.preferred_schedule && (
                  <p className="text-sm text-slate-600">
                    Jadwal diminati: {r.preferred_schedule}
                  </p>
                )}
                {r.trial_fee_status !== "paid" && (
                  <form action={markTrialPaidAction} className="mt-2">
                    <input type="hidden" name="registration_id" value={r.id} />
                    <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                      Tandai Sudah Bayar
                    </GlassButton>
                  </form>
                )}

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <form
                    action={approveRegistrationAction}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="registration_id" value={r.id} />
                    <input type="hidden" name="full_name" value={r.parent_name} />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-700">
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
                      <label className="text-xs text-slate-700">
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
                    <GlassButton
                      type="submit"
                      className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
                    >
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
        <h2 className={`mb-4 ${HEADING}`}>Riwayat Pendaftar</h2>
        <div className="flex flex-col gap-2">
          {others.length === 0 && (
            <p className="text-sm text-slate-600">Belum ada.</p>
          )}
          {others.map((r) => {
            const program = r.program as unknown as { name: string } | null;
            return (
              <DataRow
                key={r.id}
                primary={
                  <>
                    {r.child_name} &middot; {program?.name ?? "-"}
                  </>
                }
                secondary={STATUS_LABEL[r.status] ?? r.status}
              />
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
