export function WhatsappFab({ phone }: { phone?: string | null }) {
  if (!phone) return null;

  const digits = phone.replace(/[^0-9]/g, "").replace(/^0/, "62");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(
    "Halo, saya mau tanya-tanya soal Sari Les Renang"
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-green-500/90 text-2xl shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-transform hover:scale-105"
      aria-label="Chat WhatsApp"
    >
      💬
    </a>
  );
}
