import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/create-account";
import { jakartaToday, toISODate } from "@/lib/week";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, PageHeader, EmptyState, StatTile, FilterBar, FIELD_CLASS } from "@/components/admin/ui";
import { KeuanganTabs } from "../keuangan-tabs";
import { rupiah, formatDate, formatDateTime } from "@/lib/admin/format";
import { loadProgramsAndLocations } from "@/lib/finance/lookups";
import { EXPENSE_CATEGORY_LABEL, EXPENSE_STATUS_LABEL, type ExpenseCategory, type ExpensePaymentStatus } from "@/lib/finance/shared";
import { createExpenseAction, updateExpenseAction, markExpensePaidAction, cancelExpenseAction } from "./actions";

const STATUS_TONE: Record<ExpensePaymentStatus, "neutral" | "warn" | "ok" | "danger"> = {
  belum_dibayar: "warn",
  dibayar: "ok",
  dibatalkan: "danger",
};

type Params = { q?: string; category?: string; status?: string; edit?: string; error?: string };

export default async function BiayaPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const todayISO = toISODate(jakartaToday());

  const { programs } = await loadProgramsAndLocations(supabase);

  const { data: expenseRows } = await supabase
    .from("operational_expenses")
    .select(
      "id, category, amount, expense_date, program_id, location, vendor, reference_number, attachment_url, note, payment_status, payment_method, cancelled_reason, is_test, updated_at"
    )
    .order("expense_date", { ascending: false });

  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = (expenseRows ?? []).filter((e) => {
    if (sp.category && e.category !== sp.category) return false;
    if (sp.status && e.payment_status !== sp.status) return false;
    if (q && ![e.vendor, e.note, e.reference_number].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
  const programName = new Map(programs.map((p) => [p.id, p.name]));

  const totalBelumDibayar = rows.filter((e) => e.payment_status === "belum_dibayar").reduce((s, e) => s + Number(e.amount), 0);
  const totalDibayarBulanIni = rows
    .filter((e) => e.payment_status === "dibayar" && e.expense_date.slice(0, 7) === todayISO.slice(0, 7))
    .reduce((s, e) => s + Number(e.amount), 0);

  const editing = sp.edit ? rows.find((r) => r.id === sp.edit) : undefined;
  const back = `/admin/keuangan/biaya?${new URLSearchParams(Object.entries({ q: sp.q, category: sp.category, status: sp.status }).filter(([, v]) => v) as [string, string][]).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Biaya Operasional" subtitle="Input biaya manual: sewa lokasi, perlengkapan, marketing, operasional, pajak, dan lainnya." />
      <KeuanganTabs active="biaya" />

      {sp.error && (
        <p role="alert" className="rounded-xl bg-[#FFE3EA] px-4 py-3 text-sm text-[#A3183C]">{decodeURIComponent(sp.error)}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Belum dibayar" value={rupiah(totalBelumDibayar)} hint={`${rows.filter((e) => e.payment_status === "belum_dibayar").length} biaya`} />
        <StatTile label="Dibayar bulan ini" value={rupiah(totalDibayarBulanIni)} />
      </div>

      <GlassCard>
        <h2 className="mb-3 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">{editing ? "Edit biaya" : "Catat biaya baru"}</h2>
        <ToastForm action={editing ? updateExpenseAction : createExpenseAction} resetOnSuccess={!editing} className="flex flex-col gap-3">
          <input type="hidden" name="return" value={back} />
          {editing && <input type="hidden" name="expense_id" value={editing.id} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Kategori
              <GlassSelect name="category" defaultValue={editing?.category ?? "operasional"}>
                {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                  <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>
                ))}
              </GlassSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Nominal (Rp)
              <GlassInput name="amount" type="number" min={0} defaultValue={editing?.amount ?? ""} required />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Tanggal
              <GlassInput name="expense_date" type="date" defaultValue={editing?.expense_date ?? todayISO} required />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Program (opsional)
              <GlassSelect name="program_id" defaultValue={editing?.program_id ?? ""}>
                <option value="">-</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </GlassSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Lokasi (opsional)
              <GlassInput name="location" defaultValue={editing?.location ?? ""} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Vendor/penerima
              <GlassInput name="vendor" defaultValue={editing?.vendor ?? ""} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-800">
              Nomor referensi
              <GlassInput name="reference_number" defaultValue={editing?.reference_number ?? ""} />
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
              Alasan perubahan (wajib bila nominal diubah setelah dibayar)
              <GlassInput name="change_reason" placeholder="Contoh: koreksi nominal" />
            </label>
          )}
          {!editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_test" value="true" className="h-4 w-4" /> Tandai sebagai data uji ([TEST])
            </label>
          )}
          <div className="flex items-center gap-3">
            <GlassButton type="submit" className="w-fit !bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]">
              {editing ? "Simpan perubahan" : "Catat biaya"}
            </GlassButton>
            {editing && <a href={back} className="text-sm text-slate-600 underline">Batal</a>}
          </div>
        </ToastForm>
      </GlassCard>

      <FilterBar action="/admin/keuangan/biaya">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
          Cari
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Vendor, catatan, atau no. referensi" className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Kategori
          <select name="category" defaultValue={sp.category ?? ""} className={FIELD_CLASS}>
            <option value="">Semua kategori</option>
            {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Status
          <select name="status" defaultValue={sp.status ?? ""} className={FIELD_CLASS}>
            <option value="">Semua status</option>
            {(Object.keys(EXPENSE_STATUS_LABEL) as ExpensePaymentStatus[]).map((s) => <option key={s} value={s}>{EXPENSE_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <GlassButton type="submit" className="!bg-[#35C5D0] px-5 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">Terapkan</GlassButton>
      </FilterBar>

      <GlassCard className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Daftar biaya</h2>
        {rows.length === 0 ? (
          <EmptyState title="Belum ada biaya tercatat." hint="Catat biaya pertama di atas." />
        ) : (
          rows.map((e) => (
            <div key={e.id} className="flex flex-col gap-1.5 rounded-xl border border-white/50 bg-white/50 px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#17263D]">
                    {rupiah(e.amount)} &middot; {EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category}
                    {e.vendor ? ` · ${e.vendor}` : ""}
                    {e.is_test && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">[TEST]</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(e.expense_date)} {e.program_id ? `· ${programName.get(e.program_id) ?? "-"}` : ""} {e.location ? `· ${e.location}` : ""} {e.reference_number ? `· Ref: ${e.reference_number}` : ""}
                  </p>
                  {e.note && <p className="text-xs text-slate-600">{e.note}</p>}
                  {e.payment_status === "dibatalkan" && e.cancelled_reason && <p className="text-xs text-[#A3183C]">Dibatalkan: {e.cancelled_reason}</p>}
                  {e.attachment_url && (
                    <a href={e.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0B6470] underline">Lihat lampiran</a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone={STATUS_TONE[e.payment_status as ExpensePaymentStatus] ?? "neutral"}>{EXPENSE_STATUS_LABEL[e.payment_status as ExpensePaymentStatus] ?? e.payment_status}</Badge>
                  <div className="flex items-center gap-1.5">
                    {e.payment_status === "belum_dibayar" && (
                      <>
                        <a href={`${back}${back.includes("?") ? "&" : "?"}edit=${e.id}`} className="rounded-xl border border-white/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white/60">Edit</a>
                        <ToastForm action={markExpensePaidAction} pendingLabel="Memproses...">
                          <input type="hidden" name="expense_id" value={e.id} />
                          <input type="hidden" name="return" value={back} />
                          <GlassButton type="submit" className="!bg-[#35C5D0] px-3 py-1.5 text-xs !text-white hover:!bg-[#2bb0ba]">Tandai dibayar</GlassButton>
                        </ToastForm>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {e.payment_status !== "dibatalkan" && (
                <details className="text-xs">
                  <summary className="cursor-pointer select-none text-[#A3183C]">Batalkan biaya ini</summary>
                  <ToastForm action={cancelExpenseAction} pendingLabel="Membatalkan..." className="mt-1.5 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="expense_id" value={e.id} />
                    <input type="hidden" name="return" value={back} />
                    <GlassInput name="cancelled_reason" placeholder="Alasan pembatalan (wajib)" required className="w-64" />
                    <GlassButton type="submit" className="border border-[#F3C6D1] bg-[#FFE3EA] px-3 py-1.5 text-xs text-[#A3183C] hover:bg-[#ffd3e0]">Batalkan</GlassButton>
                  </ToastForm>
                </details>
              )}
              <p className="text-[11px] text-slate-400">Terakhir diubah {formatDateTime(e.updated_at)}</p>
            </div>
          ))
        )}
      </GlassCard>
    </div>
  );
}
