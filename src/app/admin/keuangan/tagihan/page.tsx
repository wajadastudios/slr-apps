import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/create-account";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge, PageHeader, StatTile, EmptyState } from "@/components/admin/ui";
import { ADMIN_CTA } from "@/lib/ui-classes";
import { KeuanganTabs } from "../keuangan-tabs";
import { rupiah, formatDate } from "@/lib/admin/format";
import { isOverdue } from "@/lib/admin/quota";

const STATUS_LABEL: Record<string, string> = { sent: "Menunggu pembayaran", processing: "Menunggu verifikasi" };

export default async function KeuanganTagihanPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: receivables }, { data: overdueSetting }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, student_id, amount, status, sent_at, package_name, student:student_id(full_name)")
      .in("status", ["sent", "processing"])
      .order("sent_at", { ascending: true }),
    supabase.from("site_settings").select("value").eq("key", "jatuh_tempo_hari").maybeSingle(),
  ]);

  const overdueDays = Number(overdueSetting?.value) > 0 ? Number(overdueSetting?.value) : 7;
  const rows = receivables ?? [];
  const totalPiutang = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const overdue = rows.filter((r) => isOverdue({ status: r.status, sent_at: r.sent_at }, overdueDays));
  const totalOverdue = overdue.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tagihan (Piutang)"
        subtitle="Fokus keuangan: total yang belum dibayar. Untuk membuat, edit, kirim, dan revisi tagihan, gunakan halaman Tagihan operasional."
        actions={
          <Link href="/admin/tagihan" className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${ADMIN_CTA}`}>
            Kelola tagihan →
          </Link>
        }
      />
      <KeuanganTabs active="tagihan" />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Total piutang" value={rupiah(totalPiutang)} hint={`${rows.length} tagihan belum dibayar`} />
        <StatTile label="Piutang jatuh tempo" value={rupiah(totalOverdue)} hint={`${overdue.length} tagihan lewat ${overdueDays} hari`} />
      </div>

      <GlassCard className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Daftar piutang</h2>
        {rows.length === 0 ? (
          <EmptyState title="Tidak ada piutang." hint="Semua tagihan yang dikirim sudah lunas, dibatalkan, atau kedaluwarsa." />
        ) : (
          rows.map((r) => {
            const student = r.student as unknown as { full_name: string } | null;
            const late = isOverdue({ status: r.status, sent_at: r.sent_at }, overdueDays);
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/50 bg-white/50 px-4 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-[#17263D]">
                    <Link href={`/admin/murid/${r.student_id}?tab=tagihan`} className="hover:underline">
                      {student?.full_name ?? "Peserta"}
                    </Link>{" "}
                    &mdash; {r.package_name} &middot; {rupiah(r.amount)}
                  </p>
                  <p className="text-xs text-slate-500">Dikirim {formatDate(r.sent_at)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={r.status === "processing" ? "info" : "warn"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  {late && <Badge tone="danger">Jatuh tempo</Badge>}
                </div>
              </div>
            );
          })
        )}
      </GlassCard>
    </div>
  );
}
