import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { WaterBg } from "@/components/water-bg";
import { PublicInvoicePaymentForm } from "@/components/public-invoice-payment-form";

const HEADING = "font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg />
      <GlassCard className="w-full max-w-md">{children}</GlassCard>
    </div>
  );
}

type PublicInvoice = {
  out_invoice_number: string;
  out_status: string;
  out_package_name: string;
  out_sessions_count: number;
  out_amount: number;
  out_base_price: number | null;
  out_discount_amount: number;
  out_currency: string;
  out_sent_at: string | null;
  out_created_at: string;
  out_due_at: string | null;
  out_student_name: string;
  out_superseded_by_token: string | null;
};

// The public, no-login-required payment link -- opened from WhatsApp,
// incognito, a different device, whatever. Only ever shows the minimum a
// payer needs (invoice number, participant name, package, total, status,
// due date) via the SECURITY DEFINER get_public_invoice() RPC -- never the
// student_id/billing_account_id/payment_proof_url/internal notes that the
// logged-in /invoice/[id] page can see. See 0040_audit_fixes.sql.
export default async function PublicInvoicePaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data: invoiceData }, { data: settings }] = await Promise.all([
    supabase.rpc("get_public_invoice", { p_token: token }).maybeSingle(),
    supabase.from("site_settings").select("key, value").in("key", ["qris_image_url", "bank_transfer_info"]),
  ]);

  if (!invoiceData) notFound();
  const invoice = invoiceData as PublicInvoice;

  const get = (key: string) => settings?.find((s) => s.key === key)?.value || "";
  const qrisImageUrl = get("qris_image_url");
  const bankTransferInfo = get("bank_transfer_info");

  return (
    <Shell>
      <h1 className={HEADING}>Tagihan Les Renang</h1>

      <div className="mt-4 flex flex-col gap-1 rounded-xl border border-white/30 bg-white/30 p-4 text-sm text-slate-700">
        <p>
          <span className="text-slate-500">Peserta:</span>{" "}
          <span className="font-medium text-[#17263D]">{invoice.out_student_name}</span>
        </p>
        <p>
          <span className="text-slate-500">Paket:</span>{" "}
          {invoice.out_package_name} ({invoice.out_sessions_count} sesi)
        </p>
        <p>
          <span className="text-slate-500">Nomor Invoice:</span> {invoice.out_invoice_number}
        </p>
        {invoice.out_due_at && (
          <p>
            <span className="text-slate-500">Jatuh tempo:</span>{" "}
            {new Date(invoice.out_due_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}
      </div>

      <p className="mt-4 text-sm font-semibold text-[#17263D]">
        Total Tagihan: Rp{Number(invoice.out_amount).toLocaleString("id-ID")}
      </p>

      <Link
        href={`/invoice/pay/${token}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-sm text-[#35C5D0] underline"
      >
        Unduh Invoice (PDF)
      </Link>

      {invoice.out_status === "paid" && (
        <p className="mt-4 text-sm font-medium text-[#1a8f6f]">✅ Pembayaran sudah dikonfirmasi. Terima kasih!</p>
      )}

      {invoice.out_status === "superseded" && (
        <div className="mt-4 rounded-xl bg-[#FFF1CC] px-4 py-3 text-sm font-medium text-[#7A5400]">
          <p>✏️ Tagihan ini sudah direvisi dan tidak berlaku lagi.</p>
          {invoice.out_superseded_by_token && (
            <Link href={`/invoice/pay/${invoice.out_superseded_by_token}`} className="mt-1 inline-block underline">
              Buka tagihan terbaru →
            </Link>
          )}
        </div>
      )}

      {invoice.out_status === "cancelled" && (
        <p className="mt-4 rounded-xl bg-[#FFE3EA] px-4 py-3 text-sm font-medium text-[#A3183C]">
          ✕ Tagihan ini sudah dibatalkan dan tidak dapat dibayar. Hubungi admin bila ada pertanyaan.
        </p>
      )}

      {invoice.out_status === "expired" && (
        <p className="mt-4 rounded-xl bg-[#FFE3EA] px-4 py-3 text-sm font-medium text-[#A3183C]">
          ⏰ Tagihan ini sudah kedaluwarsa. Hubungi admin untuk tagihan baru.
        </p>
      )}

      {invoice.out_status === "processing" && (
        <p className="mt-4 text-sm font-medium text-[#b45309]">
          ⏳ Pembayaran Anda sedang diproses. Anda akan mendapat notifikasi WhatsApp jika pembayaran sudah dikonfirmasi. Terima kasih.
        </p>
      )}

      {invoice.out_status === "sent" && (
        <>
          {qrisImageUrl && (
            <div className="mt-3 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrisImageUrl} alt="QRIS Sari Les Renang" className="w-40 rounded-xl border border-white/40 bg-white object-contain" />
            </div>
          )}
          {bankTransferInfo && <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{bankTransferInfo}</p>}
          {!qrisImageUrl && !bankTransferInfo && (
            <p className="mt-3 text-sm text-slate-600">Info pembayaran belum tersedia, silakan hubungi admin.</p>
          )}

          <div className="mt-4">
            <PublicInvoicePaymentForm token={token} />
          </div>
        </>
      )}
    </Shell>
  );
}
