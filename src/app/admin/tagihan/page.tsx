import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { MONTHS } from "@/lib/months";
import { generateInvoicesAction, sendInvoiceAction, markPaidAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  sent: "Terkirim",
  paid: "Sudah Bayar",
};

export default async function TagihanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, student_id, period_month, period_year, amount, status, student:student_id(full_name)"
    )
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const { data: hadirReports } = await supabase
    .from("progress_reports")
    .select("student_id, session_date")
    .eq("attendance", "hadir");

  const hadirCount = new Map<string, number>();
  for (const r of hadirReports ?? []) {
    const d = new Date(r.session_date);
    const key = `${r.student_id}-${d.getFullYear()}-${d.getMonth() + 1}`;
    hadirCount.set(key, (hadirCount.get(key) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Generate Tagihan
        </h2>
        <form
          action={generateInvoicesAction}
          className="flex flex-wrap items-end gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Bulan
            </label>
            <GlassSelect name="period_month" defaultValue={defaultMonth}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Tahun
            </label>
            <GlassInput
              name="period_year"
              type="number"
              defaultValue={defaultYear}
              className="w-28"
            />
          </div>
          <GlassButton type="submit">Generate untuk Murid Aktif</GlassButton>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">
            {decodeURIComponent(error)}
          </p>
        )}
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Membuat draft tagihan (nominal Rp0) untuk setiap murid aktif yang
          belum punya tagihan di periode ini. Aman dijalankan berkali-kali —
          murid yang sudah punya tagihan tidak akan diduplikasi.
        </p>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Tagihan
        </h2>
        <div className="flex flex-col gap-3">
          {(!invoices || invoices.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada tagihan.
            </p>
          )}
          {invoices?.map((inv) => {
            const student = inv.student as unknown as {
              full_name: string;
            } | null;
            const sessions =
              hadirCount.get(
                `${inv.student_id}-${inv.period_year}-${inv.period_month}`
              ) ?? 0;

            return (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {student?.full_name} &mdash; {MONTHS[inv.period_month - 1]}{" "}
                    {inv.period_year}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {sessions} sesi hadir bulan ini &middot;{" "}
                    {STATUS_LABEL[inv.status] ?? inv.status}
                  </p>
                </div>

                {inv.status === "draft" && (
                  <form
                    action={sendInvoiceAction}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="invoice_id" value={inv.id} />
                    <GlassInput
                      name="amount"
                      type="number"
                      min={1}
                      placeholder="Nominal (Rp)"
                      defaultValue={inv.amount > 0 ? inv.amount : undefined}
                      className="w-36"
                      required
                    />
                    <GlassButton type="submit" className="px-4 py-2 text-sm">
                      Setujui &amp; Kirim
                    </GlassButton>
                  </form>
                )}

                {inv.status === "sent" && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      Rp{Number(inv.amount).toLocaleString("id-ID")}
                    </span>
                    <form action={markPaidAction}>
                      <input type="hidden" name="invoice_id" value={inv.id} />
                      <GlassButton type="submit" className="px-4 py-2 text-sm">
                        Tandai Sudah Bayar
                      </GlassButton>
                    </form>
                  </div>
                )}

                {inv.status === "paid" && (
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Rp{Number(inv.amount).toLocaleString("id-ID")} &mdash; Lunas
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
