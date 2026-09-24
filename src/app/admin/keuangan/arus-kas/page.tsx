import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/create-account";
import { jakartaToday, toISODate } from "@/lib/week";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, PageHeader, EmptyState, StatTile } from "@/components/admin/ui";
import { FinanceFilterBar } from "@/components/admin/finance-filter-bar";
import { KeuanganTabs } from "../keuangan-tabs";
import { rupiah, formatDate, formatDateTime } from "@/lib/admin/format";
import { syncAllToCashFlow } from "@/lib/finance/sync";
import { loadProgramsAndLocations } from "@/lib/finance/lookups";
import { resolvePeriod } from "@/lib/finance/shared";
import { CASH_FLOW_CATEGORY_LABEL, CASH_FLOW_STATUS_LABEL, type CashFlowCategory, type CashFlowStatus } from "@/lib/finance/shared";
import { createEntryAction, updateEntryAction, cancelEntryAction } from "./actions";

const STATUS_TONE: Record<CashFlowStatus, "neutral" | "warn" | "ok" | "danger"> = {
  draft: "neutral",
  tercatat: "ok",
  dibayar: "ok",
  dibatalkan: "danger",
};

type Params = { from?: string; to?: string; program?: string; location?: string; error?: string; edit?: string; test?: string };

export default async function ArusKasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const todayISO = toISODate(jakartaToday());
  const period = resolvePeriod(sp, todayISO);
  const includeTest = sp.test === "1";

  await syncAllToCashFlow(supabase, session.user.id);

  const { programs, locations } = await loadProgramsAndLocations(supabase);

  const { data: entryRows } = await supabase
    .from("cash_flow_entries")
    .select(
      "id, entry_date, direction, category, amount, payment_method, invoice_id, payroll_payment_id, expense_id, program_id, location, note, attachment_url, status, cancelled_reason, is_test, created_at, updated_at"
    )
    .gte("entry_date", period.from)
    .lte("entry_date", period.to)
    .order("entry_date", { ascending: false });

  const rows = (entryRows ?? []).filter(
    (e) => (!sp.program || e.program_id === sp.program) && (!sp.location || e.location === sp.location)
  );
  const programName = new Map(programs.map((p) => [p.id, p.name]));

  // The ledger below always lists every entry (each one already carries its
  // own [TEST] tag), but the at-a-glance totals stay production-only by
  // default -- same "excluded unless QA mode" rule as Ringkasan.
  const totalMasuk = rows
    .filter((r) => r.direction === "masuk" && r.status !== "dibatalkan" && (includeTest || !r.is_test))
    .reduce((s, r) => s + Number(r.amount), 0);
  const totalKeluar = rows
    .filter((r) => r.direction === "keluar" && r.status !== "dibatalkan" && (includeTest || !r.is_test))
    .reduce((s, r) => s + Number(r.amount), 0);

  const editing = sp.edit ? rows.find((r) => r.id === sp.edit) : undefined;
  const back = `/admin/keuangan/arus-kas?${new URLSearchParams(
    Object.entries({ from: period.from, to: period.to, program: sp.program, location: sp.location }).filter(([, v]) => v) as [string, string][]
  ).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Arus Kas" subtitle="Buku kas manual, plus pembayaran murid/gaji/biaya yang sudah lunas tercatat otomatis." />
      <KeuanganTabs active="arus-kas" />

      <FinanceFilterBar action="/admin/keuangan/arus-kas" from={period.from} to={period.to} program={sp.program} location={sp.location} programs={programs} locations={locations} />

      {sp.error && (
        <p role="alert" className="rounded-xl bg-[#FFE3EA] px-4 py-3 text-sm text-[#A3183C]">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Total masuk (periode)" value={rupiah(totalMasuk)} hint={includeTest ? "Termasuk data [TEST]" : "Tanpa data [TEST]"} />
        <StatTile label="Total keluar (periode)" value={rupiah(totalKeluar)} hint={includeTest ? "Termasuk data [TEST]" : "Tanpa data [TEST]"} />
      </div>
      <a
        href={`?${new URLSearchParams({ from: period.from, to: period.to, program: sp.program ?? "", location: sp.location ?? "", ...(includeTest ? {} : { test: "1" }) }).toString()}`}
        className="w-fit text-xs text-[#0B6470] underline"
      >
        {includeTest ? "Kembali ke total tanpa data [TEST]" : "Sertakan data [TEST] di total (mode QA)"}
      </a>

      <GlassCard>
        <h2 className="mb-3 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          {editing ? "Edit transaksi manual" : "Catat transaksi manual"}
        </h2>
        <ToastForm action={editing ? updateEntryAction : createEntryAction} resetOnSuccess={!editing} className="flex flex-col gap-3">
          <input type="hidden" name="return" value={back} />
          {editing && <input type="hidden" name="entry_id" value={editing.id} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Jenis
              <GlassSelect name="direction" defaultValue={editing?.direction ?? "keluar"}>
                <option value="masuk">Masuk</option>
                <option value="keluar">Keluar</option>
              </GlassSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Kategori
              <GlassSelect name="category" defaultValue={editing?.category ?? "operasional"}>
                {(Object.keys(CASH_FLOW_CATEGORY_LABEL) as CashFlowCategory[]).map((c) => (
                  <option key={c} value={c}>{CASH_FLOW_CATEGORY_LABEL[c]}</option>
                ))}
              </GlassSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Nominal (Rp)
              <GlassInput name="amount" type="number" min={0} defaultValue={editing?.amount ?? ""} required />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Tanggal transaksi
              <GlassInput name="entry_date" type="date" defaultValue={editing?.entry_date ?? todayISO} required />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Metode pembayaran
              <GlassInput name="payment_method" placeholder="Transfer / Tunai / QRIS" defaultValue={editing?.payment_method ?? ""} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Program (opsional)
              <GlassSelect name="program_id" defaultValue={editing?.program_id ?? ""}>
                <option value="">-</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </GlassSelect>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Lokasi (opsional)
              <GlassInput name="location" list="finance-locations" defaultValue={editing?.location ?? ""} />
              <datalist id="finance-locations">
                {locations.map((l) => <option key={l} value={l} />)}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Lampiran bukti (URL, opsional)
              <GlassInput name="attachment_url" placeholder="https://..." defaultValue={editing?.attachment_url ?? ""} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-slate-800">
            Catatan
            <GlassInput name="note" defaultValue={editing?.note ?? ""} />
          </label>
          {editing && (
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Alasan perubahan (wajib bila nominal diubah)
              <GlassInput name="change_reason" placeholder="Contoh: salah input nominal" />
            </label>
          )}
          {!editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_test" value="true" className="h-4 w-4" />
              Tandai sebagai data uji ([TEST]) -- tidak dihitung sebagai transaksi sungguhan saat dibersihkan
            </label>
          )}
          <div className="flex items-center gap-3">
            <GlassButton type="submit" className="w-fit !bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]">
              {editing ? "Simpan perubahan" : "Catat transaksi"}
            </GlassButton>
            {editing && (
              <a href={back} className="text-sm text-slate-600 underline">Batal</a>
            )}
          </div>
        </ToastForm>
      </GlassCard>

      <GlassCard className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Daftar transaksi</h2>
        {rows.length === 0 ? (
          <EmptyState title="Belum ada transaksi pada periode ini." hint="Catat transaksi manual di atas, atau tunggu invoice/gaji/biaya berikutnya lunas." />
        ) : (
          rows.map((e) => {
            const auto = e.invoice_id || e.payroll_payment_id || e.expense_id;
            return (
              <div key={e.id} className="flex flex-col gap-1.5 rounded-xl border border-white/50 bg-white/50 px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#17263D]">
                      {e.direction === "masuk" ? "+" : "-"}{rupiah(e.amount)} &middot; {CASH_FLOW_CATEGORY_LABEL[e.category as CashFlowCategory] ?? e.category}
                      {e.is_test && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">[TEST]</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(e.entry_date)} {e.payment_method ? `· ${e.payment_method}` : ""} {e.program_id ? `· ${programName.get(e.program_id) ?? "-"}` : ""} {e.location ? `· ${e.location}` : ""}
                      {auto ? " · tercatat otomatis" : " · manual"}
                    </p>
                    {e.note && <p className="text-xs text-slate-600">{e.note}</p>}
                    {e.status === "dibatalkan" && e.cancelled_reason && (
                      <p className="text-xs text-[#A3183C]">Dibatalkan: {e.cancelled_reason}</p>
                    )}
                    {e.attachment_url && (
                      <a href={e.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0B6470] underline">
                        Lihat lampiran
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[e.status as CashFlowStatus] ?? "neutral"}>{CASH_FLOW_STATUS_LABEL[e.status as CashFlowStatus] ?? e.status}</Badge>
                    {!auto && e.status !== "dibatalkan" && (
                      <a href={`${back}${back.includes("?") ? "&" : "?"}edit=${e.id}`} className="rounded-xl border border-white/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white/60">
                        Edit
                      </a>
                    )}
                  </div>
                </div>
                {e.status !== "dibatalkan" && (
                  <details className="text-xs">
                    <summary className="cursor-pointer select-none text-[#A3183C]">Batalkan transaksi ini</summary>
                    <ToastForm action={cancelEntryAction} pendingLabel="Membatalkan..." className="mt-1.5 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="entry_id" value={e.id} />
                      <input type="hidden" name="return" value={back} />
                      <GlassInput name="cancelled_reason" placeholder="Alasan pembatalan (wajib)" required className="w-64" />
                      <GlassButton type="submit" className="border border-[#F3C6D1] bg-[#FFE3EA] px-3 py-1.5 text-xs text-[#A3183C] hover:bg-[#ffd3e0]">
                        Batalkan
                      </GlassButton>
                    </ToastForm>
                  </details>
                )}
                <p className="text-[11px] text-slate-400">Terakhir diubah {formatDateTime(e.updated_at)}</p>
              </div>
            );
          })
        )}
      </GlassCard>
    </div>
  );
}
