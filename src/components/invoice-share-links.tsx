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
  const pdfUrl = `${origin}/invoice/${invoiceId}`;
  const message = `Invoice les renang untuk ${studentName}: ${pdfUrl}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const mailHref = `mailto:${parentEmail ?? ""}?subject=${encodeURIComponent(
    `Invoice Les Renang - ${studentName}`
  )}&body=${encodeURIComponent(message)}`;

  const linkClass =
    "text-xs text-blue-700 underline dark:text-blue-300 whitespace-nowrap";

  return (
    <div className="flex flex-wrap gap-3">
      <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Lihat Invoice (PDF)
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
