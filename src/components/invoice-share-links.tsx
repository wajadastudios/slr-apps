export function InvoiceShareLinks({
  origin,
  invoiceId,
  studentName,
  parentEmail,
}: {
  origin: string;
  invoiceId: string;
  studentName: string;
  parentEmail?: string;
}) {
  const pageUrl = `${origin}/invoice/${invoiceId}`;
  const pdfUrl = `${origin}/invoice/${invoiceId}/pdf`;
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
