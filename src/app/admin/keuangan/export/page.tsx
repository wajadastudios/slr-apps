import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/create-account";
import { jakartaToday, toISODate } from "@/lib/week";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { PageHeader, FIELD_CLASS } from "@/components/admin/ui";
import { KeuanganTabs } from "../keuangan-tabs";
import { loadProgramsAndLocations } from "@/lib/finance/lookups";
import { resolvePeriod } from "@/lib/finance/shared";

type Params = { from?: string; to?: string; program?: string; location?: string };

export default async function ExportKeuanganPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const todayISO = toISODate(jakartaToday());
  const period = resolvePeriod(sp, todayISO);
  const { programs, locations } = await loadProgramsAndLocations(supabase);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Export Laporan" subtitle="Satu file Excel berisi 9 sheet: ringkasan, arus kas, pendapatan per program/lokasi, piutang, biaya, gaji, pajak (estimasi), dan audit trail." />
      <KeuanganTabs active="export" />

      <GlassCard>
        <h2 className="mb-3 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Pilih filter</h2>
        <form action="/admin/keuangan/export/download" method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-800">
            Dari tanggal
            <GlassInput name="from" type="date" defaultValue={period.from} className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-800">
            Sampai tanggal
            <GlassInput name="to" type="date" defaultValue={period.to} className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-800">
            Program
            <select name="program" defaultValue={sp.program ?? ""} className={FIELD_CLASS}>
              <option value="">Semua program</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-800">
            Lokasi
            <select name="location" defaultValue={sp.location ?? ""} className={FIELD_CLASS}>
              <option value="">Semua lokasi</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700">
            <input type="checkbox" name="test" value="1" className="h-4 w-4" />
            Sertakan data uji [TEST] (mode QA)
          </label>
          <GlassButton type="submit" className="!bg-[#35C5D0] px-5 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">
            Download Excel
          </GlassButton>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Secara default, transaksi berlabel [TEST]/QA dikecualikan dari semua sheet (kolom &ldquo;Data uji&rdquo; di sheet Arus Kas tetap menandainya bila mode QA dicentang). Setiap export tercatat di Audit Trail Keuangan (periode, filter, waktu, dan siapa yang mengexport). Sheet pajak selalu berlabel &ldquo;Estimasi internal — verifikasi dengan akuntan sebelum pelaporan.&rdquo;
        </p>
      </GlassCard>
    </div>
  );
}
