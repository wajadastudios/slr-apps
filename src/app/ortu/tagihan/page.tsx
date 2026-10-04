import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { DataRow } from "@/components/ui/data-row";
import { InvoiceShareLinks } from "@/components/invoice-share-links";
import { formatDate } from "@/lib/admin/format";

const HEADING =
  "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function OrtuTagihanPage() {
  const supabase = await createClient();
  const origin = await getSiteOrigin();

  // RLS already scopes this to the caller's own children and to
  // status in ('sent', 'processing', 'paid') — drafts stay invisible.
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, package_name, sessions_count, amount, status, public_token, created_at, paid_at, student:student_id(full_name)",
    )
    .order("created_at", { ascending: false });

  // Newest first: open invoices by billing date, history by payment date
  // (migrated invoices keep their original dates, see 0047).
  const paidOn = (i: { paid_at: string | null; created_at: string }) =>
    i.paid_at ?? i.created_at;
  const belumBayar = (invoices ?? []).filter((i) => i.status === "sent");
  const sedangDiproses = (invoices ?? []).filter(
    (i) => i.status === "processing",
  );
  const sudahBayar = (invoices ?? [])
    .filter((i) => i.status === "paid")
    .sort(
      (a, b) =>
        paidOn(b).localeCompare(paidOn(a)) ||
        b.created_at.localeCompare(a.created_at),
    );

  function InvoiceRow({ inv }: { inv: (typeof belumBayar)[number] }) {
    const student = inv.student as unknown as { full_name: string } | null;
    return (
      <DataRow
        primary={
          <>
            {student?.full_name} &mdash; {inv.package_name} (
            {inv.sessions_count} sesi)
          </>
        }
        secondary={
          <>
            <p className="mb-1 text-xs text-slate-500">
              Ditagih {formatDate(inv.created_at)}
              {inv.status === "paid" && inv.paid_at && (
                <> · Lunas {formatDate(inv.paid_at)}</>
              )}
            </p>
            <InvoiceShareLinks
              origin={origin}
              publicToken={inv.public_token}
              studentName={student?.full_name ?? ""}
              status={inv.status}
            />
          </>
        }
        action={
          <span className="min-w-[110px] text-right text-sm font-medium text-[#17263D]">
            Rp{Number(inv.amount).toLocaleString("id-ID")}
          </span>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Tagihan
      </h1>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Belum Dibayar</h2>
        <div className="flex flex-col gap-2">
          {belumBayar.length === 0 && (
            <p className="text-sm text-slate-600">
              Tidak ada tagihan yang belum dibayar.
            </p>
          )}
          {belumBayar.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} />
          ))}
        </div>
      </GlassCard>

      {sedangDiproses.length > 0 && (
        <GlassCard>
          <h2 className={`mb-4 ${HEADING}`}>Menunggu Verifikasi</h2>
          <div className="flex flex-col gap-2">
            {sedangDiproses.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Riwayat Pembayaran</h2>
        <div className="flex flex-col gap-2">
          {sudahBayar.length === 0 && (
            <p className="text-sm text-slate-600">
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
