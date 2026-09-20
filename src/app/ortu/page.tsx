import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ChildSummaryWidget } from "@/components/child-summary-widget";
import {
  computeLatestAchievement,
  computeNextSession,
  computeSessionQuota,
  formatSessionQuota,
  getGreeting,
  latestNextFocus,
} from "@/lib/progress";
import { PRIMARY_BUTTON } from "@/lib/ui-classes";
import { DAYS } from "@/lib/days";
import { loadIndicatorConfigs } from "@/lib/indicator-loader";
import { EMPTY_INDICATOR_CONFIG } from "@/lib/indicators";
import { selfRegisterAction, addChildAndRegisterAction } from "./actions";
import { ToastForm } from "@/components/ui/toast-form";

export default async function OrtuDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; child_added?: string }>;
}) {
  const { error, child_added } = await searchParams;
  const supabase = await createClient();
  const session = await getUserWithRole();

  const [
    { data: children },
    { data: programs },
    { data: invoices },
    { data: reports },
    { data: scheduleRows },
    { data: pelatihNames },
    { data: classSlots },
    { data: availability },
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, full_name, nickname, birth_date, program_id, program:program_id(name)"
      )
      .order("full_name"),
    supabase
      .from("programs")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("invoices")
      .select("student_id, status, sessions_count, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("progress_reports")
      .select("student_id, session_date, attendance, scores, next_focus")
      .order("session_date", { ascending: false }),
    supabase
      .from("schedules")
      .select("student_id, slot:slot_id(day_of_week, start_time, pelatih_id)"),
    supabase.rpc("get_public_pelatih_names"),
    supabase
      .from("class_slots")
      .select(
        "id, label, day_of_week, start_time, capacity, program:program_id(name)"
      )
      .order("day_of_week")
      .order("start_time"),
    supabase.rpc("get_slot_availability"),
  ]);

  const filledBySlot = new Map<string, number>();
  for (const row of availability ?? []) {
    filledBySlot.set(row.slot_id, Number(row.filled));
  }

  const availableSlots = (classSlots ?? [])
    .map((s) => {
      const program = s.program as unknown as { name: string } | null;
      const filled = filledBySlot.get(s.id) ?? 0;
      return {
        id: s.id,
        remaining: s.capacity - filled,
        label: `${DAYS[s.day_of_week]}, ${s.start_time.slice(0, 5)} WIB — ${
          program?.name ?? "Program"
        }${s.label ? ` (${s.label})` : ""} · Sisa ${Math.max(s.capacity - filled, 0)}`,
      };
    })
    .filter((s) => s.remaining > 0);

  const latestInvoiceStatus = new Map<string, string>();
  const invoicesByStudent = new Map<string, NonNullable<typeof invoices>>();
  for (const inv of invoices ?? []) {
    if (!latestInvoiceStatus.has(inv.student_id)) {
      latestInvoiceStatus.set(inv.student_id, inv.status);
    }
    const list = invoicesByStudent.get(inv.student_id) ?? [];
    list.push(inv);
    invoicesByStudent.set(inv.student_id, list);
  }

  const reportsByStudent = new Map<string, NonNullable<typeof reports>>();
  for (const r of reports ?? []) {
    const list = reportsByStudent.get(r.student_id) ?? [];
    list.push(r);
    reportsByStudent.set(r.student_id, list);
  }

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) {
    pelatihNameById.set(p.id, p.full_name);
  }

  const slotsByStudent = new Map<
    string,
    { day_of_week: number; start_time: string; label: string | null; pelatihName: string | null }[]
  >();
  for (const row of scheduleRows ?? []) {
    const slot = row.slot as unknown as {
      day_of_week: number;
      start_time: string;
      pelatih_id: string;
    } | null;
    if (!slot) continue;
    const list = slotsByStudent.get(row.student_id) ?? [];
    list.push({
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      label: null,
      pelatihName: pelatihNameById.get(slot.pelatih_id) ?? null,
    });
    slotsByStudent.set(row.student_id, list);
  }

  const indicatorConfigs = await loadIndicatorConfigs(
    supabase,
    [...new Set((children ?? []).map((c) => c.program_id).filter(Boolean))] as string[]
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        {getGreeting()}, {session?.fullName ?? "Orang Tua"} 👋
      </h1>

      {(!children || children.length === 0) && (
        <GlassCard>
          <p className="text-sm text-slate-600">
            Belum ada data anak terdaftar.
          </p>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {children?.map((child) => {
          const program = child.program as unknown as { name: string } | null;
          const status = latestInvoiceStatus.get(child.id);
          const childReports = reportsByStudent.get(child.id) ?? [];
          const quota = formatSessionQuota(
            computeSessionQuota(invoicesByStudent.get(child.id) ?? [], childReports)
          );

          const nextSession = computeNextSession(slotsByStudent.get(child.id) ?? []);
          const nextSessionLabel = nextSession
            ? `${DAYS[nextSession.day_of_week]} · ${nextSession.start_time.slice(0, 5)} WIB${
                nextSession.pelatihName ? ` · Coach ${nextSession.pelatihName}` : ""
              }`
            : null;

          return (
            <Link key={child.id} href={`/ortu/anak/${child.id}`}>
              <ChildSummaryWidget
                className="h-full transition-transform duration-200 hover:scale-[1.01] hover:border-[#35C5D0]/50"
                childLabel={`${child.nickname || child.full_name} · ${program?.name ?? "Belum ada program"}`}
                kehadiran={quota}
                tagihanLabel={
                  !status
                    ? "Belum Ada Tagihan"
                    : status === "paid"
                      ? "Lunas"
                      : status === "processing"
                        ? "Menunggu Verifikasi"
                        : "Belum Bayar"
                }
                tagihanOk={status === "paid"}
                nextFocus={latestNextFocus(childReports)}
                achievement={computeLatestAchievement(
                  childReports,
                  indicatorConfigs[child.program_id] ?? EMPTY_INDICATOR_CONFIG
                )}
                laporanTersedia={childReports.length > 0}
                nextSessionLabel={nextSessionLabel}
              />
            </Link>
          );
        })}
      </div>

      <GlassCard>
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Tambah Anak &amp; Daftar Jadwal
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Daftarkan anak baru dan pilih jadwal kelas yang masih tersedia.
          Admin akan langsung dihubungi untuk follow up setelah Anda daftar.
        </p>
        <ToastForm
          action={addChildAndRegisterAction} resetOnSuccess
          className="mt-3 grid gap-3 sm:grid-cols-3"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Anak</label>
            <GlassInput name="full_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Tanggal Lahir</label>
            <GlassInput name="birth_date" type="date" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Jadwal Kelas</label>
            <GlassSelect name="slot_id" required defaultValue="" glassChevron>
              <option value="" disabled>
                Pilih jadwal
              </option>
              {availableSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton
            type="submit"
            disabled={availableSlots.length === 0}
            className={`${PRIMARY_BUTTON} px-4 py-2 text-sm sm:col-span-3 sm:w-fit`}
          >
            Daftar
          </GlassButton>
        </ToastForm>
        {availableSlots.length === 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Belum ada jadwal yang tersedia saat ini.
          </p>
        )}
        {child_added && (
          <p className="mt-2 text-sm text-[#1a8f6f]">
            Pendaftaran berhasil! Admin akan segera menghubungi Anda.
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm text-red-700">{decodeURIComponent(error)}</p>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Daftarkan Diri Sendiri ke Kelas
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Untuk Anda sendiri (remaja/dewasa) yang ingin ikut kelas renang,
          bukan untuk anak.
        </p>
        <ToastForm
          action={selfRegisterAction} resetOnSuccess
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Program</label>
            <GlassSelect name="program_id" required defaultValue="" className="min-w-[220px]" glassChevron>
              <option value="" disabled>
                Pilih program
              </option>
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton
            type="submit"
            disabled={!programs || programs.length === 0}
            className={`${PRIMARY_BUTTON} px-4 py-2 text-sm`}
          >
            Daftarkan
          </GlassButton>
        </ToastForm>
      </GlassCard>
    </div>
  );
}
