import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { generateInvoicesAction, sendInvoiceAction, markPaidAction } from "./actions";

const SESSIONS_PER_PACKAGE = 4;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  sent: "Terkirim",
  paid: "Sudah Bayar",
};

function packageLabel(n: number) {
  const start = (n - 1) * SESSIONS_PER_PACKAGE + 1;
  const end = n * SESSIONS_PER_PACKAGE;
  return `Paket ${n} (sesi ${start}–${end})`;
}

export default async function TagihanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, student_id, package_number, amount, status, student:student_id(full_name)"
    )
    .order("package_number", { ascending: false });

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("active", true)
    .order("full_name");

  const { data: hadirReports } = await supabase
    .from("progress_reports")
    .select("student_id")
    .eq("attendance", "hadir");

  const hadirCount = new Map<string, number>();
  for (const r of hadirReports ?? []) {
    hadirCount.set(r.student_id, (hadirCount.get(r.student_id) ?? 0) + 1);
  }

  const studentsWithPendingDraft = new Set(
    (invoices ?? []).filter((i) => i.status === "draft").map((i) => i.student_id)
  );

  const dueSoon = (students ?? []).filter(
    (s) => !studentsWithPendingDraft.has(s.id)
  );

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          Generate Tagihan
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Setiap murid ditagih per paket {SESSIONS_PER_PACKAGE} sesi hadir —
          bukan per bulan kalender. Klik tombol ini untuk membuat draft
          tagihan bagi murid yang baru saja mencapai kelipatan{" "}
          {SESSIONS_PER_PACKAGE} sesi hadir. Aman diklik kapan saja/berkali-kali;
          murid yang belum mencapai jatahnya atau sudah punya draft tidak akan
          diduplikasi.
        </p>
        <form action={generateInvoicesAction}>
          <GlassButton type="submit">Generate Tagihan</GlassButton>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">
            {decodeURIComponent(error)}
          </p>
        )}

        {dueSoon.length > 0 && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <p className="mb-2 text-sm text-slate-800 dark:text-slate-200">
              Progres menuju paket berikutnya:
            </p>
            <div className="flex flex-wrap gap-2">
              {dueSoon.map((s) => {
                const count = hadirCount.get(s.id) ?? 0;
                const progress = count % SESSIONS_PER_PACKAGE;
                return (
                  <span
                    key={s.id}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-700 dark:text-slate-300"
                  >
                    {s.full_name}: {progress}/{SESSIONS_PER_PACKAGE}
                  </span>
                );
              })}
            </div>
          </div>
        )}
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

            return (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {student?.full_name} &mdash;{" "}
                    {packageLabel(inv.package_number)}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
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
