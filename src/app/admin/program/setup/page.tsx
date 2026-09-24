import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge, EmptyState, PageHeader } from "@/components/admin/ui";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { loadReadiness, PROGRAM_SETUP_COLUMNS, type SetupProgramRow } from "@/lib/admin/readiness-load";
import { programChecklist, readyBlockers } from "@/lib/admin/readiness";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function ProgramSetupListPage() {
  const supabase = await createClient();
  const { data: programs } = await supabase.from("programs").select(PROGRAM_SETUP_COLUMNS).order("name");

  const rows = await Promise.all(
    ((programs ?? []) as SetupProgramRow[]).map(async (p) => {
      const input = await loadReadiness(supabase, p);
      const steps = programChecklist(input).filter((s) => !s.optional);
      return { p, done: steps.filter((s) => s.done).length, total: steps.length, blockers: readyBlockers(input) };
    })
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Atur Program"
        subtitle="Siapkan program baru langkah demi langkah. Program baru menerima pendaftar setelah semua syarat terpenuhi."
        actions={
          <Link href="/admin/program" className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}>
            Edit cepat program
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada program."
          hint="Buat program pertama di halaman Program; setelah itu Anda diarahkan ke daftar langkah penyiapannya."
          action={
            <Link href="/admin/program" className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}>
              Buat program
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ p, done, total, blockers }) => (
            <GlassCard key={p.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={HEADING}>{p.name}</h2>
                {!p.active ? (
                  <Badge>Nonaktif</Badge>
                ) : p.registration_open && blockers.length > 0 ? (
                  // setRegistrationOpenAction blocks turning this ON while
                  // anything is missing, but a program opened before that
                  // guard existed (or that later lost a package/slot/coach)
                  // can still be sitting here inconsistent -- never show a
                  // clean "ok" badge for that, so it isn't mistaken for
                  // actually ready.
                  <Badge tone="danger">Menerima pendaftar, tapi belum lengkap</Badge>
                ) : p.registration_open ? (
                  <Badge tone="ok">Menerima pendaftar</Badge>
                ) : blockers.length === 0 ? (
                  <Badge tone="info">Siap dibuka</Badge>
                ) : (
                  <Badge tone="warn">Belum siap</Badge>
                )}
              </div>
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200/80" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={`${done} dari ${total} langkah selesai`}>
                  <div className="h-full rounded-full bg-[#0E7C89]" style={{ width: `${(done / total) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {done} dari {total} langkah selesai
                </p>
              </div>
              {blockers.length > 0 && <p className="text-sm text-slate-600">Yang masih kurang: {blockers[0]}</p>}
              <Link href={`/admin/program/setup/${p.id}`} className={`inline-flex min-h-11 w-fit items-center rounded-2xl border px-5 text-sm font-semibold ${blockers.length === 0 && !p.registration_open ? ADMIN_CTA : SECONDARY_BUTTON}`}>
                {p.registration_open ? "Lihat checklist" : "Lanjutkan penyiapan"}
              </Link>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
