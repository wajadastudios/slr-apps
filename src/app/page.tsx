import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { DAYS } from "@/lib/days";

const NAV = [
  { href: "#kelas", label: "Kelas" },
  { href: "#jadwal", label: "Jadwal" },
  { href: "#harga", label: "Harga" },
  { href: "#testimoni", label: "Testimoni" },
  { href: "#galeri", label: "Galeri" },
  { href: "#kontak", label: "Kontak" },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} dari 5 bintang`}>
      {"★".repeat(rating)}
      <span className="text-slate-300 dark:text-slate-600">
        {"★".repeat(5 - rating)}
      </span>
    </span>
  );
}

export default async function Home() {
  const supabase = await createClient();

  const [
    { data: programs },
    { data: testimonials },
    { data: gallery },
    { data: settings },
    { data: slots },
    { data: packages },
    { data: availability },
    { data: pelatihNames },
  ] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description, badge")
      .order("name"),
    supabase
      .from("testimonials")
      .select("author_name, content, rating, photo_url")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("gallery_items")
      .select("media_url, media_type, caption")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("site_settings").select("key, value"),
    supabase
      .from("class_slots")
      .select(
        "id, pelatih_id, label, day_of_week, start_time, capacity, program:program_id(name)"
      )
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("program_packages")
      .select("id, program_id, name, sessions_count, price, benefits")
      .eq("active", true)
      .order("sessions_count"),
    supabase.rpc("get_slot_availability"),
    supabase.rpc("get_public_pelatih_names"),
  ]);

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) {
    pelatihNameById.set(p.id, p.full_name);
  }

  const get = (key: string) =>
    settings?.find((s) => s.key === key)?.value || "";

  const heroImage = gallery?.find((g) => g.media_type === "image")?.media_url;

  const filledBySlot = new Map<string, number>();
  for (const row of availability ?? []) {
    filledBySlot.set(row.slot_id, Number(row.filled));
  }

  const packagesByProgram = new Map<string, typeof packages>();
  for (const p of packages ?? []) {
    const list = packagesByProgram.get(p.program_id) ?? [];
    list.push(p);
    packagesByProgram.set(p.program_id, list);
  }

  const stats = [
    { label: "Keluarga Aktif", value: get("stat_families") },
    { label: "Berdiri & Beroperasi", value: get("stat_years") },
    { label: "Pelatih Bersertifikat", value: get("stat_trainers") },
    { label: "Rating Kepuasan", value: get("stat_rating") },
  ].filter((s) => s.value);

  const aboutText = get("about_text");

  return (
    <div className="relative flex min-h-screen flex-col gap-16 pb-20">
      <WhatsappFab phone={get("phone")} />

      {/* Sticky nav */}
      <div className="sticky top-4 z-40 mx-auto w-full max-w-3xl px-4">
        <nav className="flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/30 bg-white/50 px-3 py-2.5 shadow-[0_8px_32px_rgba(31,38,135,0.1)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/50">
          <Link href="/" className="mr-2 flex items-center gap-1.5 pl-1">
            <Image src="/logo.png" alt="Sari Les Renang" width={24} height={24} />
            <span className="hidden text-sm font-bold text-slate-900 dark:text-white sm:inline">
              Sari Les Renang
            </span>
          </Link>
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/50 dark:text-slate-200 dark:hover:bg-white/10"
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/login"
            className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/50 dark:text-slate-200 dark:hover:bg-white/10"
          >
            Masuk
          </Link>
        </nav>
      </div>

      {/* Hero */}
      <section className="relative flex flex-col items-center gap-6 overflow-hidden px-6 pt-12 pb-24 text-center">
        <WaterBg imageUrl={heroImage} />
        <h1 className="text-4xl font-bold sm:text-5xl">
          <span className="text-slate-900 dark:text-white">Belajar Renang,</span>{" "}
          <span className="text-amber-500">Tumbuh</span>{" "}
          <span className="text-teal-600 dark:text-teal-300">Bersama di Air</span>
        </h1>
        <p className="max-w-xl text-lg text-slate-800 dark:text-slate-100">
          Program renang anak, aquanatal, dan hydrotherapy — dirancang untuk
          mendampingi setiap tahap perjalanan keluarga Anda, dipantau
          langsung lewat laporan perkembangan setiap sesi.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/daftar">
            <GlassButton className="border-teal-400/60 bg-teal-500/90 px-8 py-3 text-base font-semibold text-white hover:bg-teal-500">
              Daftar Kelas Trial &rarr;
            </GlassButton>
          </Link>
          <a href="#kelas">
            <GlassButton className="px-8 py-3 text-base">
              Lihat Program
            </GlassButton>
          </a>
        </div>

        {stats.length > 0 && (
          <div className="mt-4 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <GlassCard key={s.label} className="text-center">
                <p className="text-2xl font-bold text-teal-600 dark:text-teal-300">
                  {s.value}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {s.label}
                </p>
              </GlassCard>
            ))}
          </div>
        )}
      </section>

      {/* Programs */}
      <section id="kelas" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Jenis &amp; Deskripsi Kelas
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {programs?.map((p) => (
            <GlassCard key={p.id}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {p.name}
              </h3>
              {p.badge && (
                <span className="mt-1 inline-block rounded-full bg-teal-500/15 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300">
                  {p.badge}
                </span>
              )}
              {p.description && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {p.description}
                </p>
              )}
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Jadwal Tersedia */}
      <section id="jadwal" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Jadwal Tersedia
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(!slots || slots.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Jadwal akan segera diumumkan.
            </p>
          )}
          {slots?.map((s) => {
            const program = s.program as unknown as { name: string } | null;
            const pelatihName = pelatihNameById.get(s.pelatih_id);
            const filled = filledBySlot.get(s.id) ?? 0;
            const full = filled >= s.capacity;
            return (
              <GlassCard key={s.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {DAYS[s.day_of_week]}, {s.start_time} &mdash; {program?.name}
                    {s.label ? ` (${s.label})` : ""}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Pelatih: {pelatihName ?? "-"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    full
                      ? "bg-red-500/20 text-red-700 dark:text-red-300"
                      : "bg-green-500/20 text-green-700 dark:text-green-300"
                  }`}
                >
                  {full ? "Penuh" : `Sisa ${s.capacity - filled}`}
                </span>
              </GlassCard>
            );
          })}
        </div>
      </section>

      {/* Harga & Paket */}
      <section id="harga" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Harga &amp; Paket
        </h2>
        <div className="flex flex-col gap-4">
          {programs?.map((p) => {
            const progPackages = packagesByProgram.get(p.id) ?? [];
            if (progPackages.length === 0) return null;
            return (
              <GlassCard key={p.id}>
                <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
                  {p.name}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {progPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="rounded-xl border border-teal-300/40 bg-teal-100/20 p-3 dark:bg-teal-300/10"
                    >
                      <p className="font-medium text-slate-900 dark:text-white">
                        {pkg.name} &middot; {pkg.sessions_count} sesi
                      </p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white">
                        Rp{Number(pkg.price).toLocaleString("id-ID")}
                      </p>
                      {pkg.benefits && pkg.benefits.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-sm text-slate-600 dark:text-slate-400">
                          {pkg.benefits.map((b: string, i: number) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            );
          })}
          {packages && packages.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Info harga akan segera diumumkan.
            </p>
          )}
        </div>
      </section>

      {/* Testimonials */}
      {testimonials && testimonials.length > 0 && (
        <section id="testimoni" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Kata Mereka
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <GlassCard key={i}>
                {t.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.photo_url}
                    alt={t.author_name}
                    className="mb-3 h-32 w-full rounded-xl object-cover"
                  />
                )}
                {t.rating && (
                  <p className="mb-1">
                    <Stars rating={t.rating} />
                  </p>
                )}
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  &ldquo;{t.content}&rdquo;
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                  &mdash; {t.author_name}
                </p>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Gallery */}
      {gallery && gallery.length > 0 && (
        <section id="galeri" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Galeri
          </h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g, i) =>
              g.media_type === "video" ? (
                <video
                  key={i}
                  src={g.media_url}
                  controls
                  className="h-32 w-full rounded-xl object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={g.media_url}
                  alt={g.caption ?? ""}
                  className="h-32 w-full rounded-xl object-cover"
                />
              )
            )}
          </div>
        </section>
      )}

      {/* Tentang Kami */}
      {aboutText && (
        <section className="mx-auto w-full max-w-3xl px-6">
          <GlassCard>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">
              Tentang Kami
            </p>
            <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
              {aboutText}
            </p>
          </GlassCard>
        </section>
      )}

      {/* CTA banner */}
      <section className="mx-auto w-full max-w-3xl px-6">
        <GlassCard className="flex flex-col items-center gap-3 border-teal-300/40 bg-teal-50/30 text-center dark:bg-teal-400/10">
          <Image src="/logo.png" alt="Sari Les Renang" width={56} height={56} />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Siap Memulai Petualangan di Air Bersama SLR?
          </h2>
          <p className="max-w-md text-sm text-slate-700 dark:text-slate-300">
            Daftar kelas trial dan temukan program yang paling cocok untuk
            keluarga Anda.
          </p>
          <Link href="/daftar">
            <GlassButton className="border-teal-400/60 bg-teal-500/90 px-8 py-3 text-base font-semibold text-white hover:bg-teal-500">
              Daftar Kelas Trial
            </GlassButton>
          </Link>
        </GlassCard>
      </section>

      {/* Contact */}
      <section id="kontak" className="mx-auto w-full max-w-2xl scroll-mt-24 px-6">
        <GlassCard className="text-center">
          <h2 className="mb-3 text-2xl font-semibold text-slate-900 dark:text-white">
            Lokasi &amp; Kontak
          </h2>
          <div className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
            {get("address") && <p>{get("address")}</p>}
            {get("phone") && <p>Telepon/WhatsApp: {get("phone")}</p>}
            {get("email") && <p>Email: {get("email")}</p>}
            {get("operating_hours") && <p>Jam Operasional: {get("operating_hours")}</p>}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/daftar">
              <GlassButton className="border-teal-400/60 bg-teal-500/90 font-semibold text-white hover:bg-teal-500">
                Daftar Member Baru
              </GlassButton>
            </Link>
            <Link href="/login">
              <GlassButton>Masuk ke Portal</GlassButton>
            </Link>
          </div>
        </GlassCard>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex w-full max-w-4xl flex-col items-center gap-2 border-t border-white/20 px-6 pt-8 text-center">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={20} height={20} />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Sari Les Renang
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          &copy; {new Date().getFullYear()} Sari Les Renang. Semua hak
          dilindungi.
        </p>
        <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-400">
          <Link href="/privasi" className="hover:underline">
            Kebijakan Privasi
          </Link>
          <Link href="/syarat" className="hover:underline">
            Syarat &amp; Ketentuan
          </Link>
          <a href="#kontak" className="hover:underline">
            Kontak
          </a>
        </div>
      </footer>
    </div>
  );
}
