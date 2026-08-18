import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { VideoAdsPlayer } from "@/components/video-ads-player";
import { FaqAccordion } from "@/components/faq-accordion";
import { DAYS } from "@/lib/days";

const NAV = [
  { href: "#kelas", label: "Program" },
  { href: "#tentang", label: "Tentang Kami" },
  { href: "#testimoni", label: "Testimoni" },
  { href: "#faq", label: "FAQ" },
  { href: "#kontak", label: "Kontak" },
];

const HEADING_FONT = "font-[family-name:var(--font-quicksand)]";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-[#FFC800]" aria-label={`${rating} dari 5 bintang`}>
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function programIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("aquanatal") || n.includes("hamil")) return "🤰";
  if (n.includes("hydro")) return "💧";
  return "🏊";
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
    { data: poolLocations },
    { data: faqItems },
  ] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description, badge")
      .eq("active", true)
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
        "id, pelatih_id, label, location, day_of_week, start_time, capacity, program:program_id(name)"
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
    supabase
      .from("pool_locations")
      .select("id, name, maps_link")
      .order("created_at"),
    supabase
      .from("faq_items")
      .select("id, question, answer")
      .order("sort_order")
      .order("created_at"),
  ]);

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) {
    pelatihNameById.set(p.id, p.full_name);
  }

  const get = (key: string) =>
    settings?.find((s) => s.key === key)?.value || "";

  const mediaAd1Url = get("media_ad_1_url");
  const mediaAd1Type = get("media_ad_1_type");
  const mediaAd2Url = get("media_ad_2_url");
  const mediaAd2Type = get("media_ad_2_type");
  const videoAdsUrl = get("video_ads_url");

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
    { label: "Rating Kepuasan", value: get("stat_rating") },
  ].filter((s) => s.value);

  const aboutText = get("about_text");
  const founderCertifications = get("founder_certifications");

  return (
    <div className="relative flex min-h-screen flex-col gap-16 overflow-hidden bg-gradient-to-b from-[#DDF7FA] via-[#EEF9FB] to-[#FEFCE8] pb-20 font-[family-name:var(--font-plus-jakarta)]">
      <WhatsappFab phone={get("phone")} />

      {/* Sticky nav */}
      <div className="sticky top-4 z-40 mx-auto w-full max-w-4xl px-4">
        <nav className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/30 bg-white/50 px-4 py-2.5 shadow-[0_8px_32px_rgba(31,38,135,0.1)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-1.5 pl-1">
            <Image src="/logo.png" alt="Sari Les Renang" width={96} height={96} />
            <span className={`${HEADING_FONT} text-sm font-bold text-[#17263D]`}>
              Sari Les Renang
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/50"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/50"
            >
              Masuk
            </Link>
            <Link href="/daftar">
              <GlassButton className="!border-[#35C5D0]/60 !bg-[#35C5D0] px-4 py-1.5 text-sm font-semibold !text-white hover:!bg-[#2bb0ba]">
                Daftar Kelas Trial
              </GlassButton>
            </Link>
          </div>
        </nav>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-8 pb-16">
        <WaterBg
          imageUrl={mediaAd1Type === "image" ? mediaAd1Url : undefined}
          videoUrl={mediaAd1Type === "video" ? mediaAd1Url : undefined}
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-2">
          {/* Text column */}
          <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
            <h1 className={`${HEADING_FONT} text-4xl font-bold leading-tight sm:text-5xl`}>
              <span className="text-[#17263D]">Belajar Renang,</span>
              <br />
              <span className="text-[#FFC800]">Tumbuh</span>
              <br />
              <span className="text-[#35C5D0]">Bersama di Air</span>
            </h1>
            <p className="max-w-lg text-lg text-slate-700">
              Program renang anak, aquanatal, dan hydrotherapy — dirancang
              untuk mendampingi setiap tahap perjalanan keluarga Anda.
              Dipantau langsung lewat platform digital SLR.
            </p>
            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/daftar">
                <GlassButton className="!border-[#35C5D0]/60 !bg-[#35C5D0] px-8 py-3 text-base font-semibold !text-white hover:!bg-[#2bb0ba]">
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
              <div className="mt-2 grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
                {stats.map((s) => (
                  <GlassCard key={s.label} className="text-center">
                    <p className="text-2xl font-bold text-[#35C5D0]">
                      {s.value}
                    </p>
                    <p className="text-xs text-slate-700">{s.label}</p>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>

          {/* Photo + dashboard preview column */}
          <div className="relative mx-auto w-full max-w-md pb-16 lg:pb-24">
            <div className="relative overflow-hidden rounded-3xl border border-white/40 shadow-[0_20px_60px_rgba(23,38,61,0.25)]">
              {mediaAd1Url && mediaAd1Type === "video" ? (
                <video
                  src={mediaAd1Url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : mediaAd1Url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaAd1Url}
                  alt="Sesi renang bersama pengajar SLR"
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#35C5D0] via-[#7ee0d8] to-[#FFE585] text-center">
                  <span className="text-5xl">🦆</span>
                  <span className="px-6 text-sm font-medium text-white/90">
                    Foto sesi renang akan segera tersedia
                  </span>
                </div>
              )}
            </div>

            {/* Floating dashboard mock */}
            <div className="absolute -bottom-2 left-1/2 w-[92%] -translate-x-1/2 rounded-2xl border border-white/50 bg-white/85 p-4 shadow-[0_16px_40px_rgba(23,38,61,0.2)] backdrop-blur-xl">
              <p className="text-sm font-semibold text-[#17263D]">
                Selamat pagi, Bunda Rania 👋
              </p>
              <p className="mb-3 text-xs text-slate-500">
                Azka &middot; Baby Swim Level 2
              </p>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div className="rounded-xl bg-[#EEF9FB] p-2">
                  <p className="text-[10px] text-slate-500">Kehadiran</p>
                  <p className="text-sm font-semibold text-[#35C5D0]">8 / 8 sesi</p>
                </div>
                <div className="rounded-xl bg-[#EEF9FB] p-2">
                  <p className="text-[10px] text-slate-500">Tagihan</p>
                  <p className="text-sm font-semibold text-[#55D6A6]">Lunas</p>
                </div>
                <div className="rounded-xl bg-[#EEF9FB] p-2">
                  <p className="text-[10px] text-slate-500">Progress</p>
                  <p className="text-sm font-semibold text-[#35C5D0]">72%</p>
                </div>
                <div className="rounded-xl bg-[#EEF9FB] p-2">
                  <p className="text-[10px] text-slate-500">Laporan</p>
                  <p className="text-sm font-semibold text-[#55D6A6]">Tersedia</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Skill Renang Azka</span>
                  <span>72%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#35C5D0] to-[#55D6A6]" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#FFF8E1] p-2">
                <span className="text-base">📅</span>
                <p className="text-[11px] font-medium text-[#17263D]">
                  Sesi Berikutnya: Rabu &middot; 09.00&ndash;09.45 WIB &middot; Coach Sari
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video Ads */}
      {videoAdsUrl && (
        <section className="mx-auto w-full max-w-4xl px-6">
          <VideoAdsPlayer src={videoAdsUrl} />
        </section>
      )}

      {/* Programs */}
      <section id="kelas" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6 text-center">
        <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D] sm:text-3xl`}>
          Program Renang SLR
        </h2>
        <p className="mx-auto max-w-xl text-sm text-slate-600">
          Kurikulum berbasis milestone perkembangan, dari pengenalan air
          hingga penguasaan teknik renang.
        </p>
        <div className="mt-2 grid gap-4 text-left sm:grid-cols-3">
          {programs?.map((p) => (
            <GlassCard key={p.id} className="relative">
              {p.badge && (
                <span className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-[#35C5D0] to-[#55D6A6] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {p.badge}
                </span>
              )}
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF9FB] text-lg">
                {programIcon(p.name)}
              </span>
              <h3 className="text-lg font-semibold text-[#17263D]">
                {p.name}
              </h3>
              {p.description && (
                <p className="mt-2 text-sm text-slate-600">
                  {p.description}
                </p>
              )}
              <a
                href="/daftar"
                className="mt-3 inline-block text-sm font-medium text-[#35C5D0] hover:underline"
              >
                Pelajari lebih lanjut &rarr;
              </a>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Jadwal Tersedia */}
      <section id="jadwal" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
        <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
          Jadwal Tersedia
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(!slots || slots.length === 0) && (
            <p className="text-sm text-slate-600">
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
                  <p className="font-medium text-[#17263D]">
                    {DAYS[s.day_of_week]}, {s.start_time} &mdash; {program?.name}
                    {s.label ? ` (${s.label})` : ""}
                  </p>
                  <p className="text-sm text-slate-600">
                    Pengajar: {pelatihName ?? "-"}
                    {s.location ? ` · ${s.location}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    full
                      ? "bg-red-500/20 text-red-700"
                      : "bg-[#55D6A6]/20 text-[#1a8f6f]"
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
        <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
          Harga &amp; Paket
        </h2>
        <div className="flex flex-col gap-4">
          {programs?.map((p) => {
            const progPackages = packagesByProgram.get(p.id) ?? [];
            if (progPackages.length === 0) return null;
            return (
              <GlassCard key={p.id}>
                <h3 className="mb-3 text-lg font-semibold text-[#17263D]">
                  {p.name}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {progPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="rounded-xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-3"
                    >
                      <p className="font-medium text-[#17263D]">
                        {pkg.name} &middot; {pkg.sessions_count} sesi
                      </p>
                      <p className="text-lg font-semibold text-[#17263D]">
                        Rp{Number(pkg.price).toLocaleString("id-ID")}
                      </p>
                      {pkg.benefits && pkg.benefits.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
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
            <p className="text-sm text-slate-600">
              Info harga akan segera diumumkan.
            </p>
          )}
        </div>
      </section>

      {/* Pool Locations */}
      {poolLocations && poolLocations.length > 0 && (
        <section id="lokasi" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
          <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
            Lokasi Kolam
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {poolLocations.map((loc) => (
              <GlassCard key={loc.id} className="p-3">
                <p className="mb-2 px-1 font-semibold text-[#17263D]">
                  {loc.name}
                </p>
                <iframe
                  src={loc.maps_link}
                  className="h-64 w-full rounded-xl border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Gallery */}
      {gallery && gallery.length > 0 && (
        <section id="galeri" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
          <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
            Galeri
          </h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-white/30 bg-white/20 p-1 shadow-sm backdrop-blur-md transition hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(23,38,61,0.18)]"
              >
                {g.media_type === "video" ? (
                  <video
                    src={g.media_url}
                    controls
                    className="h-32 w-full rounded-xl object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.media_url}
                    alt={g.caption ?? ""}
                    className="h-32 w-full rounded-xl object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {testimonials && testimonials.length > 0 && (
        <section id="testimoni" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6 text-center">
          <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
            Kata Keluarga SLR
          </h2>
          <p className="mx-auto max-w-md text-sm text-slate-600">
            Pengalaman nyata dari orang tua dan peserta program kami.
          </p>
          <div className="mt-2 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <GlassCard key={i}>
                {t.rating && (
                  <p className="mb-1">
                    <Stars rating={t.rating} />
                  </p>
                )}
                <p className="text-sm text-slate-700">
                  &ldquo;{t.content}&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-3">
                  {t.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.photo_url}
                      alt={t.author_name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF9FB] text-sm font-semibold text-[#35C5D0]">
                      {t.author_name.charAt(0)}
                    </div>
                  )}
                  <p className="text-sm font-medium text-[#17263D]">
                    {t.author_name}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Tentang Kami */}
      <section id="tentang" className="mx-auto w-full max-w-4xl scroll-mt-24 px-6">
        <GlassCard className="grid gap-0 overflow-hidden p-0 sm:grid-cols-2">
          <div className="relative min-h-[220px] sm:min-h-full">
            {mediaAd2Url && mediaAd2Type === "video" ? (
              <video
                src={mediaAd2Url}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : mediaAd2Url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaAd2Url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#35C5D0] to-[#55D6A6] text-5xl">
                🏊
              </div>
            )}
          </div>
          <div className="p-6 sm:p-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#35C5D0]">
              Tentang Kami
            </p>
            <h2 className={`${HEADING_FONT} text-2xl font-bold leading-snug text-[#17263D]`}>
              Bukan sekadar kolam renang &mdash; tempat keluarga tumbuh
              bersama
            </h2>
            {aboutText && (
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                {aboutText}
              </p>
            )}
            <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-[#55D6A6]">✅</span>
                Kolam higienis &mdash; air diuji dan dijaga standar
                kebersihan harian
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#55D6A6]">✅</span>
                Pengajar bersertifikat dengan rasio kelas kecil
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#55D6A6]">✅</span>
                Laporan progres digital dapat diakses orang tua setiap sesi
              </li>
            </ul>
            <div className="mt-4 rounded-2xl border border-[#FFC800]/40 bg-[#FFC800]/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#a67c00]">
                BERSERTIFIKAT:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-5">
                <Image
                  src="/Logo AASM.png"
                  alt="AASM — Association Aquatic of Sport Medicine"
                  width={140}
                  height={44}
                  className="h-9 w-auto object-contain"
                />
                <Image
                  src="/Akuatik_Indonesia_HD_transparent.png"
                  alt="Akuatik Indonesia"
                  width={44}
                  height={44}
                  className="h-11 w-auto object-contain"
                />
              </div>
              {founderCertifications && (
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                  {founderCertifications}
                </p>
              )}
            </div>
          </div>
        </GlassCard>
      </section>

      {/* FAQ */}
      {faqItems && faqItems.length > 0 && (
        <section id="faq" className="mx-auto flex w-full max-w-3xl scroll-mt-24 flex-col gap-4 px-6">
          <h2 className={`${HEADING_FONT} text-center text-2xl font-bold text-[#17263D]`}>
            Pertanyaan yang Sering Diajukan
          </h2>
          <FaqAccordion items={faqItems} />
        </section>
      )}

      {/* CTA banner */}
      <section className="mx-auto w-full max-w-3xl px-6">
        <GlassCard className="relative flex flex-col items-center gap-3 overflow-hidden border-[#35C5D0]/30 bg-gradient-to-br from-[#EEF9FB] to-[#FEFCE8] text-center">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#35C5D0]/20 blur-2xl" />
          <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-[#FFC800]/20 blur-2xl" />
          <span className="relative text-4xl">🐥👪</span>
          <h2 className={`${HEADING_FONT} relative text-2xl font-bold text-[#17263D]`}>
            Siap Memulai Petualangan di Air Bersama SLR?
          </h2>
          <p className="relative max-w-md text-sm text-slate-700">
            Daftar kelas trial dan temukan program renang yang tepat untuk
            keluarga Anda. Tanpa komitmen, tanpa biaya pendaftaran.
          </p>
          <div className="relative flex flex-wrap items-center justify-center gap-4">
            <Link href="/daftar">
              <GlassButton className="!border-[#35C5D0]/60 !bg-[#35C5D0] px-8 py-3 text-base font-semibold !text-white hover:!bg-[#2bb0ba]">
                Daftar Kelas Trial &rarr;
              </GlassButton>
            </Link>
            <a
              href="#kontak"
              className="text-sm font-semibold text-[#17263D] hover:underline"
            >
              Hubungi Kami
            </a>
          </div>
        </GlassCard>
      </section>

      {/* Contact */}
      <section id="kontak" className="mx-auto w-full max-w-2xl scroll-mt-24 px-6">
        <GlassCard className="text-center">
          <h2 className={`${HEADING_FONT} mb-3 text-2xl font-bold text-[#17263D]`}>
            Lokasi &amp; Kontak
          </h2>
          <div className="flex flex-col gap-1 text-sm text-slate-700">
            {get("phone") && <p>Telepon/WhatsApp: {get("phone")}</p>}
            {get("email") && <p>Email: {get("email")}</p>}
            {get("instagram") && (
              <p>
                Instagram:{" "}
                <a
                  href={`https://instagram.com/${get("instagram")?.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  @{get("instagram")?.replace(/^@/, "")}
                </a>
              </p>
            )}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/daftar">
              <GlassButton className="!border-[#35C5D0]/60 !bg-[#35C5D0] font-semibold !text-white hover:!bg-[#2bb0ba]">
                Daftar Member Baru
              </GlassButton>
            </Link>
            <Link href="/login">
              <GlassButton>Masuk ke Akun</GlassButton>
            </Link>
          </div>
        </GlassCard>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex w-full max-w-4xl flex-col items-center gap-2 border-t border-white/30 px-6 pt-8 text-center">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={40} height={40} />
          <span className={`${HEADING_FONT} text-sm font-semibold text-[#17263D]`}>
            Sari Les Renang
          </span>
        </div>
        <p className="text-xs text-slate-600">
          &copy; {new Date().getFullYear()} Sari Les Renang. Semua hak
          dilindungi.
        </p>
        <div className="flex gap-4 text-xs text-slate-600">
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
