import { PRIMARY_BUTTON } from "@/lib/ui-classes";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M10 3.5v9" />
      <path d="M6 9l4 4 4-4" />
      <path d="M4 15.5h12" />
    </svg>
  );
}

// QRIS on the payment pages: shown large enough to scan from another phone,
// plus a download so a payer on the same phone can pick it from the gallery
// in their e-wallet / m-banking app.
export function QrisPayment({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="mt-3 flex flex-col items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="QRIS Sari Les Renang"
        className="w-80 max-w-full rounded-xl border border-white/40 bg-white object-contain"
      />
      <a
        href="/api/qris"
        download
        className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-5 text-sm font-semibold ${PRIMARY_BUTTON}`}
      >
        <DownloadIcon />
        Unduh QRIS
      </a>
      <p className="max-w-xs text-center text-xs text-slate-500">
        Simpan gambar, lalu buka aplikasi e-wallet atau m-banking dan pilih QRIS dari galeri.
      </p>
    </div>
  );
}
