import { normalizePhone } from "@/lib/registration-input";

export function InvoiceShareLinks({
  origin,
  publicToken,
  studentName,
  status,
  parentEmail,
  parentPhone,
}: {
  origin: string;
  // The unguessable public link, not the plain invoice id -- so whoever
  // this gets shared to (WhatsApp, email) can open and pay it without being
  // logged in. See 0040_audit_fixes.sql / get_public_invoice. Without a
  // token there is no working link, so nothing is offered.
  publicToken: string | null;
  studentName: string;
  status?: string;
  parentEmail?: string | null;
  parentPhone?: string | null;
}) {
  if (!publicToken) {
    return <p className="text-xs text-slate-500">Link invoice belum tersedia.</p>;
  }

  const pageUrl = `${origin}/invoice/pay/${publicToken}`;
  const pdfUrl = `${origin}/invoice/pay/${publicToken}/pdf`;
  const message =
    status === "paid"
      ? `Invoice les renang (lunas) untuk ${studentName}: ${pageUrl}`
      : `Invoice les renang untuk ${studentName}: ${pageUrl}`;
  // With the payer's number WhatsApp opens their chat directly; without it
  // WhatsApp asks which chat to send to.
  const phone = parentPhone ? normalizePhone(parentPhone) : null;
  const waHref = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(message)}`;
  const mailHref = `mailto:${parentEmail ?? ""}?subject=${encodeURIComponent(
    `Invoice Les Renang - ${studentName}`
  )}&body=${encodeURIComponent(message)}`;

  const linkClass =
    "text-xs text-[#35C5D0] underline whitespace-nowrap";

  return (
    <div className="flex flex-wrap gap-3">
      <a href={pageUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Lihat Halaman Pembayaran
      </a>
      <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Unduh PDF
      </a>
      <a href={waHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Kirim via WhatsApp
      </a>
      <a href={mailHref} className={linkClass}>
        Kirim via Email
      </a>
    </div>
  );
}
