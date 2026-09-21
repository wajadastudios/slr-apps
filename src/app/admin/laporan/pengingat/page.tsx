import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, EmptyState, PageHeader } from "@/components/admin/ui";
import { SelectAll } from "@/components/admin/select-all";
import { ADMIN_CTA } from "@/lib/ui-classes";
import { loadAdminData } from "@/lib/admin/load";
import { missingReports } from "@/lib/admin/queue";
import { formatDate } from "@/lib/admin/format";
import { sendReportRemindersAction } from "./actions";

export default async function ReportRemindersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const data = await loadAdminData(supabase);
  const { data: coachRows } = await supabase.from("users").select("id, phone").eq("role", "pelatih");
  const phoneOf = new Map((coachRows ?? []).map((c) => [c.id, c.phone as string | null]));

  const missing = missingReports(
    data.schedules,
    data.slotById,
    data.enrollments,
    data.reports,
    data.studentNames,
    data.todayISO,
    data.nowMinutes
  );

  const byCoach = new Map<string, typeof missing>();
  for (const m of missing) {
    const list = byCoach.get(m.pelatih_id) ?? [];
    list.push(m);
    byCoach.set(m.pelatih_id, list);
  }
  const coaches = [...byCoach.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/laporan" className="w-fit text-sm font-semibold text-[#0B6470] hover:underline">
        &lsaquo; Laporan
      </Link>
      <PageHeader
        title="Laporan Belum Diisi"
        subtitle="Sesi dalam 14 hari terakhir yang belum punya laporan pengajar. Pengingat dikirim lewat WhatsApp."
      />
      {error && (
        <p role="alert" className="rounded-xl bg-[#FFF0F3] px-4 py-3 text-sm text-[#7A1B36]">
          {decodeURIComponent(error)}
        </p>
      )}

      {coaches.length === 0 ? (
        <EmptyState title="Semua laporan sudah terisi." hint="Sesi yang sudah berlalu dan belum punya laporan akan muncul di sini per pengajar." />
      ) : (
        <GlassCard className="flex flex-col gap-3">
          <ToastForm action={sendReportRemindersAction} className="flex flex-col gap-3" pendingLabel="Mengirim...">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SelectAll name="pelatih_ids" label="Pilih semua pengajar" />
              <GlassButton type="submit" className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
                Kirim pengingat ke yang dipilih
              </GlassButton>
            </div>
            <ul className="flex flex-col gap-2">
              {coaches.map(([id, items]) => (
                <li key={id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 rounded-2xl border border-white/60 bg-white/60 px-4 py-3">
                  <input type="checkbox" name="pelatih_ids" value={id} disabled={!phoneOf.get(id)} aria-label={`Pilih ${data.pelatihNames.get(id)}`} className="mt-1 h-4 w-4" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#17263D]">
                      {data.pelatihNames.get(id) ?? "Pengajar"}
                      <Badge tone="warn">{items.length} laporan</Badge>
                      {!phoneOf.get(id) && <Badge tone="danger">Belum ada nomor WhatsApp</Badge>}
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-slate-600">
                      {items.slice(0, 5).map((m) => (
                        <li key={`${m.student_id}-${m.date}-${m.slotLabel}`}>
                          {m.studentName} · {m.programName} · {formatDate(m.date)} ({m.slotLabel})
                        </li>
                      ))}
                      {items.length > 5 && <li>…dan {items.length - 5} lainnya</li>}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </ToastForm>
        </GlassCard>
      )}
    </div>
  );
}
