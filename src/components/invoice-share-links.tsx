export function InvoiceShareLinks({
  origin,
  publicToken,
  studentName,
  parentEmail,
}: {
  origin: string;
  // The unguessable public link, not the plain invoice id -- so whoever
  // this gets shared to (WhatsApp, email) can open and pay it without being
  // logged in. See 0040_audit_fixes.sql / get_public_invoice.
  publicToken: string;
  studentName: string;
  parentEmail?: string;
}) {
  const pageUrl = `${origin}/invoice/pay/${publicToken}`;
  const pdfUrl = `${origin}/invoice/pay/${publicToken}/pdf`;
  const message = `Invoice les renang untuk ${studentName}: ${pageUrl}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
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
