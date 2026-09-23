import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { WaterBg } from "@/components/water-bg";
import { InvoicePaymentForm } from "@/components/invoice-payment-form";

const HEADING = "font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg />
      <GlassCard className="w-full max-w-md">{children}</GlassCard>
    </div>
  );
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes this the same way /invoice/[id]/pdf does: admin sees any
  // invoice, ortu only their own (sent/processing/paid).
  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, package_name, sessions_count, amount, base_price, discount_amount, payment_method, payment_proof_url, superseded_by_invoice_id, student:student_id(full_name)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["qris_image_url", "bank_transfer_info"]),
  ]);

  if (!invoice || invoice.status === "draft" || !invoice.invoice_number) {
    notFound();
  }

  const student = invoice.student as unknown as { full_name: string } | null;
  const get = (key: string) =>
    settings?.find((s) => s.key === key)?.value || "";
  const qrisImageUrl = get("qris_image_url");
  const bankTransferInfo = get("bank_transfer_info");

  return (
    <Shell>
      <h1 className={HEADING}>Tagihan Les Renang</h1>

      <div className="mt-4 flex flex-col gap-1 rounded-xl border border-white/30 bg-white/30 p-4 text-sm text-slate-700">
        <p>
          <span className="text-slate-500">Siswa:</span>{" "}
          <span className="font-medium text-[#17263D]">
            {student?.full_name ?? "-"}
          </span>
        </p>
        <p>
          <span className="text-slate-500">Program/Paket:</span>{" "}
          {invoice.package_name} ({invoice.sessions_count} sesi)
        </p>
        <p>
          <span className="text-slate-500">Nomor Invoice:</span>{" "}
          {invoice.invoice_number}
        </p>
      </div>

      <p className="mt-4 text-sm font-semibold text-[#17263D]">
        Total Tagihan: Rp{Number(invoice.amount).toLocaleString("id-ID")}
      </p>

      <Link
        href={`/invoice/${id}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-sm text-[#35C5D0] underline"
      >
        Unduh Invoice (PDF)
      </Link>

      {invoice.status === "paid" && (
        <p className="mt-4 text-sm font-medium text-[#1a8f6f]">
          ✅ Pembayaran sudah dikonfirmasi. Terima kasih!
        </p>
      )}

      {invoice.status === "superseded" && (
        <p className="mt-4 rounded-xl bg-[#FFF1CC] px-4 py-3 text-sm font-medium text-[#7A5400]">
          ✏️ Tagihan ini sudah direvisi dan tidak berlaku lagi. Nominal di atas tidak berubah dari yang pertama kali
          dikirim -- link pembayaran ini tidak dapat digunakan lagi. Hubungi admin untuk tagihan terbaru Anda.
        </p>
      )}

      {invoice.status === "cancelled" && (
        <p className="mt-4 rounded-xl bg-[#FFE3EA] px-4 py-3 text-sm font-medium text-[#A3183C]">
          ✕ Tagihan ini sudah dibatalkan dan tidak dapat dibayar. Hubungi admin bila ada pertanyaan.
        </p>
      )}

      {invoice.status === "expired" && (
        <p className="mt-4 rounded-xl bg-[#FFE3EA] px-4 py-3 text-sm font-medium text-[#A3183C]">
          ⏰ Tagihan ini sudah kedaluwarsa. Hubungi admin untuk tagihan baru.
        </p>
      )}

      {invoice.status === "processing" && (
        <p className="mt-4 text-sm font-medium text-[#b45309]">
          ⏳ Pembayaran Anda sedang diproses. Anda akan mendapat notifikasi
          WhatsApp jika pembayaran sudah dikonfirmasi. Terima kasih.
        </p>
      )}

      {invoice.status === "sent" && (
        <>
          {qrisImageUrl && (
            <div className="mt-3 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrisImageUrl}
                alt="QRIS Sari Les Renang"
                className="w-40 rounded-xl border border-white/40 bg-white object-contain"
              />
            </div>
          )}
          {bankTransferInfo && (
            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
              {bankTransferInfo}
            </p>
          )}
          {!qrisImageUrl && !bankTransferInfo && (
            <p className="mt-3 text-sm text-slate-600">
              Info pembayaran belum tersedia, silakan hubungi admin.
            </p>
          )}

          <div className="mt-4">
            <InvoicePaymentForm invoiceId={id} />
          </div>
        </>
      )}
    </Shell>
  );
}
