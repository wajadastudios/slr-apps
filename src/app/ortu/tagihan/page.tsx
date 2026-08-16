import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";

export default async function OrtuTagihanPage() {
  const supabase = await createClient();

  // RLS already scopes this to the caller's own children and to
  // status in ('sent', 'paid') — drafts stay invisible.
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, package_name, sessions_count, amount, status, student:student_id(full_name)"
    )
    .order("id", { ascending: false });

  const belumBayar = (invoices ?? []).filter((i) => i.status === "sent");
  const sudahBayar = (invoices ?? []).filter((i) => i.status === "paid");

  function InvoiceRow({ inv }: { inv: (typeof belumBayar)[number] }) {
    const student = inv.student as unknown as { full_name: string } | null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3">
        <span className="font-medium text-slate-900 dark:text-white">
          {student?.full_name} &mdash; {inv.package_name} ({inv.sessions_count}{" "}
          sesi)
        </span>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Rp{Number(inv.amount).toLocaleString("id-ID")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        Tagihan
      </h1>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Belum Dibayar
        </h2>
        <div className="flex flex-col gap-2">
          {belumBayar.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Tidak ada tagihan yang belum dibayar.
            </p>
          )}
          {belumBayar.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} />
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Riwayat Pembayaran
        </h2>
        <div className="flex flex-col gap-2">
          {sudahBayar.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada riwayat pembayaran.
            </p>
          )}
          {sudahBayar.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
