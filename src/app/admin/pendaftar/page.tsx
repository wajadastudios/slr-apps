import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { CopyButton } from "@/components/ui/copy-button";
import {
  approveRegistrationAction,
  rejectRegistrationAction,
  markTrialPaidAction,
  scheduleTrialAction,
} from "./actions";
import { ToastForm } from "@/components/ui/toast-form";
import Link from "next/link";
import { STATUS_LABEL as ENROLLMENT_LABEL, STATUS_TONE, type EnrollmentStatus } from "@/lib/enrollment";

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
  const origin = await getSiteOrigin();

  const [{ data: registrations }, { data: pelatihList }, { data: enrollmentQueue }] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, child_name, parent_name, parent_email, parent_phone, preferred_schedule, status, trial_fee_status, payment_method, trial_pelatih_id, trial_session_date, trial_session_time, trial_location, payment_token, trial_proof_url, created_at, program:program_id(name)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, full_name, title")
      .eq("role", "pelatih")
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("enrollments")
      .select("id, status, preferred_schedule, preferred_location, created_at, student:student_id(full_name), program:program_id(name)")
      .in("status", ["pending_review", "waiting_schedule", "schedule_offered", "scheduled"])
      .order("created_at", { ascending: false }),
  ]);

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihList ?? []) {
    pelatihNameById.set(p.id, p.title ? `${p.title} ${p.full_name}` : p.full_name);
  }

  const pending = (registrations ?? []).filter((r) => r.status === "pending");
  const others = (registrations ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      {(enrollmentQueue ?? []).length > 0 && (
        <GlassCard>
          <h2 className={`mb-1 ${HEADING}`}>Pendaftaran Kelas</h2>
          <p className="mb-3 text-sm text-slate-600">
            Peserta yang sudah punya akun dan menunggu ditinjau, dijadwalkan, atau dikonfirmasi.
          </p>
          <div className="flex flex-col gap-2">
            {(enrollmentQueue ?? []).map((row) => {
              const student = row.student as unknown as { full_name: string } | null;
              const program = row.program as unknown as { name: string } | null;
              const status = row.status as EnrollmentStatus;
              return (
                <Link
                  key={row.id}
                  href={`/admin/pendaftar/kelas/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/55 px-4 py-3 transition-colors hover:bg-[#35C5D0]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#17263D]">
                      {student?.full_name ?? "Peserta"} &middot; {program?.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {[row.preferred_schedule, row.preferred_location].filter(Boolean).join(" · ") ||
                        "Tanpa pilihan jadwal"}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}>
                    {ENROLLMENT_LABEL[status]}
                  </span>
                </Link>
              );
            })}
          </div>
        </GlassCard>
      )}

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
            const hasTrial = Boolean(r.trial_session_date);

            return (
              <div
                key={r.id}
                className="rounded-xl border border-white/30 bg-white/40 p-4"
              >
                <p className="font-medium text-[#17263D]">
                  {r.child_name} &middot; {program?.name ?? "-"}
                  {hasTrial && (
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
                  )}
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

                {!hasTrial ? (
                  <ToastForm
                    action={scheduleTrialAction}
                    className="mt-3 grid gap-3 rounded-xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-3 sm:grid-cols-4"
                  >
                    <input type="hidden" name="registration_id" value={r.id} />
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-700">Pengajar</label>
                      <GlassSelect name="trial_pelatih_id" required>
                        <option value="">Pilih pengajar</option>
                        {pelatihList?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title ? `${p.title} ${p.full_name}` : p.full_name}
                          </option>
                        ))}
                      </GlassSelect>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-700">Tanggal</label>
                      <GlassInput name="trial_session_date" type="date" required />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-700">Jam</label>
                      <GlassInput name="trial_session_time" type="time" required />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-700">Lokasi Kolam</label>
                      <GlassInput
                        name="trial_location"
                        placeholder="Kolam A / Cabang Selatan"
                      />
                    </div>
                    <GlassButton
                      type="submit"
                      className="!bg-[#35C5D0] px-3 py-1.5 text-xs !text-white hover:!bg-[#2bb0ba] sm:col-span-4 sm:w-fit"
                    >
                      Atur Jadwal Trial
                    </GlassButton>
                  </ToastForm>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/30 bg-white/30 p-3">
                    <p className="text-sm text-slate-700">
                      Trial: {r.trial_session_date} pukul{" "}
                      {String(r.trial_session_time).slice(0, 5)}
                      {r.trial_location ? ` · ${r.trial_location}` : ""} · Coach{" "}
                      {r.trial_pelatih_id
                        ? pelatihNameById.get(r.trial_pelatih_id) ?? "-"
                        : "-"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.payment_token && (
                        <CopyButton
                          value={`${origin}/trial/${r.payment_token}`}
                          label="Salin Link Pembayaran"
                        />
                      )}
                      {r.trial_proof_url && (
                        <a
                          href={r.trial_proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#35C5D0] underline"
                        >
                          Lihat Bukti Bayar
                        </a>
                      )}
                      {r.trial_fee_status !== "paid" && (
                        <ToastForm action={markTrialPaidAction} pendingLabel="Memproses...">
                          <input
                            type="hidden"
                            name="registration_id"
                            value={r.id}
                          />
                          <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                            Tandai Sudah Bayar (manual)
                          </GlassButton>
                        </ToastForm>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <ToastForm
                    action={approveRegistrationAction} pendingLabel="Memproses..."
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
                  </ToastForm>

                  <ToastForm action={rejectRegistrationAction} pendingLabel="Memproses...">
                    <input type="hidden" name="registration_id" value={r.id} />
                    <GlassButton type="submit" className="px-4 py-2 text-sm">
                      Tolak
                    </GlassButton>
                  </ToastForm>
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
