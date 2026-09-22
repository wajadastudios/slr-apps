import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { VideoAdsPlayer } from "@/components/video-ads-player";
import { FaqAccordion } from "@/components/faq-accordion";
import { PriceAccordion, type PriceGroup } from "@/components/price-accordion";
import { SiteNav } from "@/components/site-nav";
import { SmoothScrollLink } from "@/components/smooth-scroll-link";
import { ScheduleList, type ScheduleItem } from "@/components/schedule-list";
import { AppPreviewCard } from "@/components/app-preview-card";
import { AppGallery } from "@/components/app-gallery";
import { DAYS } from "@/lib/days";

const HEADING_FONT = "font-[family-name:var(--font-quicksand)]";

const WHY_SLR = [
  {
    icon: "💧",
    title: "Kolam higienis dan terjaga",
    description: "Air diuji dan dijaga standar kebersihan harian.",
  },
  {
    icon: "🎓",
    title: "Pengajar bersertifikat",
    description: "Dengan rasio kelas kecil, perhatian tiap anak lebih terjaga.",
  },
  {
    icon: "📊",
    title: "Laporan perkembangan digital",
    description: "Dapat diakses orang tua setiap sesi.",
  },
  {
    icon: "🐣",
    title: "Belajar bertahap dan ramah anak",
    description: "Materi mengikuti tahap dan kecepatan tiap anak.",
  },
];

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
      .select("id, program_id, name, sessions_count, price, benefits, badge")
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

  const allScheduleItems: ScheduleItem[] = (slots ?? []).map((s) => {
    const program = s.program as unknown as { name: string } | null;
    const pelatihName = pelatihNameById.get(s.pelatih_id);
    const filled = filledBySlot.get(s.id) ?? 0;
    return {
      id: s.id,
      title: `${DAYS[s.day_of_week]}, ${s.start_time} — ${program?.name}${
        s.label ? ` (${s.label})` : ""
      }`,
      subtitle: `Pengajar: ${pelatihName ?? "-"}${
        s.location ? ` · ${s.location}` : ""
      }`,
      full: filled >= s.capacity,
      remaining: s.capacity - filled,
    };
  });
  // Open slots first: those are the ones a visitor can actually act on.
  const scheduleItems = [
    ...allScheduleItems.filter((i) => !i.full),
    ...allScheduleItems.filter((i) => i.full),
  ];

  const packagesByProgram = new Map<string, typeof packages>();
  for (const p of packages ?? []) {
    const list = packagesByProgram.get(p.program_id) ?? [];
    list.push(p);
    packagesByProgram.set(p.program_id, list);
  }

  const priceGroups: PriceGroup[] = (programs ?? [])
    .map((p) => ({
      programId: p.id,
      programName: p.name,
      packages: (packagesByProgram.get(p.id) ?? []).map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        sessions_count: pkg.sessions_count,
        price: Number(pkg.price),
        benefits: pkg.benefits,
        badge: pkg.badge,
      })),
    }))
    .filter((g) => g.packages.length > 0);

  const stats = [
    { label: "Keluarga Aktif", value: get("stat_families") },
    { label: "Berdiri & Beroperasi", value: get("stat_years") },
    { label: "Rating Kepuasan", value: get("stat_rating") },
  ].filter((s) => s.value);

  const aboutText = get("about_text");
  const founderCertifications = get("founder_certifications");

  return (
    <div className="relative flex min-h-screen flex-col gap-16 overflow-hidden pb-20 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg variant="public" />
      <WaterBg variant="hero" />
      <WhatsappFab phone={get("phone")} />

      {/* Sticky nav */}
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-8 pb-16">
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
              <SmoothScrollLink id="kelas">
                <GlassButton className="px-8 py-3 text-base">
                  Lihat Program
                </GlassButton>
              </SmoothScrollLink>
            </div>

            {stats.length > 0 && (
              <div className="mt-2 grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
                {stats.map((s) => (
                  <GlassCard key={s.label} tone="soft" className="text-center">
                    <p className="text-2xl font-bold text-[#35C5D0]">
                      {s.value}
                    </p>
                    <p className="text-xs text-slate-700">{s.label}</p>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>

          {/* Photo + app preview card column */}
          <div className="relative mx-auto w-full max-w-md pb-72">
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

            {/* Floating app preview card */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
              <AppPreviewCard />
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

      {/* App feature highlight */}
      <section id="laporan-latihan" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-6 px-6">
        <div className="text-center">
          <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D] sm:text-3xl`}>
            Perkembangan latihan terasa lebih jelas.
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Setiap sesi, orang tua dan peserta mendapat gambaran yang nyata — fokus latihan hari itu,
            target berikutnya, dan sisa kuota sesi — semua dalam satu tampilan.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <GlassCard tone="soft" className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF9FB] text-lg">
              📋
            </span>
            <div>
              <h3 className="font-semibold text-[#17263D]">Laporan setelah latihan</h3>
              <p className="mt-0.5 text-sm text-slate-600">
                Ringkasan sesi tersedia langsung setelah latihan selesai, bisa dibuka kapan saja.
              </p>
            </div>
          </GlassCard>
          <GlassCard tone="soft" className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF8E1] text-lg">
              📅
            </span>
            <div>
              <h3 className="font-semibold text-[#17263D]">Jadwal &amp; kuota sesi transparan</h3>
              <p className="mt-0.5 text-sm text-slate-600">
                Pantau jadwal berikutnya, riwayat kehadiran, dan sisa sesi paket aktif.
              </p>
            </div>
          </GlassCard>
          <GlassCard tone="soft" className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0F2F5] text-lg">
              🏅
            </span>
            <div>
              <h3 className="font-semibold text-[#17263D]">Target latihan yang memotivasi</h3>
              <p className="mt-0.5 text-sm text-slate-600">
                Milestone yang jelas dari pengenalan air hingga renang mandiri, dengan penanda pencapaian nyata.
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* App gallery */}
      <section id="contoh-aplikasi" className="scroll-mt-24">
        <AppGallery />
      </section>

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
            <GlassCard key={p.id} tone="soft" className="relative">
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
                className="mt-3 inline-block text-sm font-medium text-[#35C5D0] hover:underline active:text-[#2bb0ba]"
              >
                Pelajari lebih lanjut &rarr;
              </a>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Grup vs Private */}
      <section id="grup-vs-private" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6 text-center">
        <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D] sm:text-3xl`}>
          Kelas Grup atau Private?
        </h2>
        <p className="mx-auto max-w-xl text-sm text-slate-600">
          Dua-duanya sama-sama efektif &mdash; bedanya di cara mengajarnya,
          bukan hasil akhirnya. Kecepatan berkembang tetap mengikuti anak
          itu sendiri.
        </p>
        <div className="mt-2 grid gap-4 text-left sm:grid-cols-2">
          <GlassCard tone="soft">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF9FB] text-lg">
              🏊
            </span>
            <h3 className="text-lg font-semibold text-[#17263D]">
              Kelas Grup
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Belajar bareng, tumbuh bareng.
            </p>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-slate-700">
              <li>
                <span className="font-medium text-[#17263D]">Fokus pelatih:</span>{" "}
                terbagi ke 4&ndash;6 anak
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Ritme belajar:</span>{" "}
                mengikuti rata-rata kecepatan kelompok
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Laporan progress:</span>{" "}
                rangkuman tiap 4 sesi
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Nilai tambah:</span>{" "}
                belajar sosial &amp; motivasi dari teman
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Cocok untuk:</span>{" "}
                anak yang senang suasana ramai &amp; kompetisi sehat
              </li>
            </ul>
          </GlassCard>

          <GlassCard tone="soft">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF9FB] text-lg">
              🎯
            </span>
            <h3 className="text-lg font-semibold text-[#17263D]">
              Kelas Private
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Fokus 100% untuk si kecil.
            </p>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-slate-700">
              <li>
                <span className="font-medium text-[#17263D]">Fokus pelatih:</span>{" "}
                100% untuk 1 anak
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Ritme belajar:</span>{" "}
                disesuaikan penuh ke kondisi anak saat itu
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Laporan progress:</span>{" "}
                tiap sesi, real-time
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Nilai tambah:</span>{" "}
                koreksi personal &amp; perhatian penuh tiap gerakan
              </li>
              <li>
                <span className="font-medium text-[#17263D]">Cocok untuk:</span>{" "}
                anak yang butuh perhatian penuh, misal masih takut air atau
                punya kebutuhan khusus
              </li>
            </ul>
          </GlassCard>
        </div>
      </section>

      {/* Kenapa Memilih SLR (nav "Tentang Kami" anchors here) */}
      <section id="tentang" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-5 px-6">
        <div className="text-center">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#35C5D0]">
            Tentang Kami
          </p>
          <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D] sm:text-3xl`}>
            Kenapa Keluarga Memilih SLR?
          </h2>
          {aboutText && (
            <p className="mx-auto mt-2 max-w-2xl whitespace-pre-line text-sm text-slate-600">
              {aboutText}
            </p>
          )}
        </div>

        {mediaAd2Url && (
          <div className="relative h-44 overflow-hidden rounded-3xl border border-white/50 shadow-[0_8px_28px_rgba(23,38,61,0.12)] sm:h-56">
            {mediaAd2Type === "video" ? (
              <video
                src={mediaAd2Url}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaAd2Url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {WHY_SLR.map((item) => (
            <GlassCard key={item.title} tone="soft" className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF9FB] text-lg">
                {item.icon}
              </span>
              <div>
                <h3 className="font-semibold text-[#17263D]">{item.title}</h3>
                <p className="mt-0.5 text-sm text-slate-600">{item.description}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-[#FFC800]/35 bg-[#FFC800]/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a67c00]">
              Bersertifikat
            </p>
            <Image
              src="/Logo AASM.png"
              alt="AASM — Association Aquatic of Sport Medicine"
              width={140}
              height={44}
              className="h-7 w-auto object-contain"
            />
            <Image
              src="/Akuatik_Indonesia_HD_transparent.png"
              alt="Akuatik Indonesia"
              width={44}
              height={44}
              className="h-8 w-auto object-contain"
            />
          </div>
          {founderCertifications && (
            <p className="whitespace-pre-line text-xs text-slate-600">
              {founderCertifications}
            </p>
          )}
        </div>
      </section>

      {/* Harga & Paket */}
      <section id="harga" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
        <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
          Harga &amp; Paket
        </h2>
        {priceGroups.length > 0 ? (
          <PriceAccordion groups={priceGroups} />
        ) : (
          <p className="text-sm text-slate-600">
            Info harga akan segera diumumkan.
          </p>
        )}
      </section>

      {/* Jadwal Tersedia */}
      <section id="jadwal" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
        <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
          Jadwal Tersedia
        </h2>
        {scheduleItems.length === 0 ? (
          <p className="text-sm text-slate-600">
            Jadwal akan segera diumumkan.
          </p>
        ) : (
          <ScheduleList items={scheduleItems} />
        )}
      </section>

      {/* Pool Locations */}
      {poolLocations && poolLocations.length > 0 && (
        <section id="lokasi" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-6">
          <h2 className={`${HEADING_FONT} text-2xl font-bold text-[#17263D]`}>
            Lokasi Kolam
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {poolLocations.map((loc) => (
              <GlassCard key={loc.id} className="overflow-hidden p-3">
                {/* Local placeholder thumbnail — no admin-uploaded photo or
                    Google Places Photo API configured yet, see note below. */}
                <div className="relative mb-2 aspect-[16/9] w-full overflow-hidden rounded-xl">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(ellipse 90% 70% at 25% 15%, rgba(53,197,208,0.55), transparent 60%), linear-gradient(140deg, #0D3A48 0%, #12586A 55%, #1C8DA0 100%)",
                    }}
                    aria-hidden="true"
                  />
                  <svg
                    viewBox="0 0 24 24"
                    className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-white/25"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M3 16c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0" />
                    <path d="M3 20c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0" />
                  </svg>
                  <div
                    className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent px-3 pb-2 pt-6"
                    aria-hidden="true"
                  />
                  <p className="absolute inset-x-3 bottom-2 truncate text-sm font-semibold text-white drop-shadow-sm">
                    {loc.name}
                  </p>
                </div>
                <iframe
                  src={loc.maps_link}
                  title={`Peta lokasi ${loc.name}`}
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
              <GlassCard key={i} tone="soft">
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

      {/* FAQ */}
      {faqItems && faqItems.length > 0 && (
        <section id="faq" className="mx-auto flex w-full max-w-3xl scroll-mt-24 flex-col gap-4 px-6">
          <h2 className={`${HEADING_FONT} text-center text-2xl font-bold text-[#17263D]`}>
            Pertanyaan yang Sering Ditanyakan
          </h2>
          <p className="mx-auto max-w-xl text-center text-sm leading-relaxed text-slate-600">
            Hal-hal penting yang perlu diketahui sebelum memulai perjalanan
            belajar renang bersama SLR.
          </p>
          <FaqAccordion items={faqItems} />
        </section>
      )}

      {/* CTA banner */}
      <section className="mx-auto w-full max-w-3xl px-6">
        <GlassCard tone="strong" className="relative flex flex-col items-center gap-3 overflow-hidden border-[#35C5D0]/30 bg-gradient-to-br from-[#EEF9FB] to-[#FEFCE8] text-center">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#35C5D0]/20 blur-2xl" />
          <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-[#FFC800]/20 blur-2xl" />
          <Image
            src="/logo.png"
            alt="Sari Les Renang"
            width={56}
            height={56}
            className="relative"
          />
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
            <SmoothScrollLink
              id="kontak"
              className="text-sm font-semibold text-[#17263D] hover:underline active:text-[#35C5D0]"
            >
              Hubungi Kami
            </SmoothScrollLink>
          </div>
        </GlassCard>
      </section>

      {/* Contact */}
      <section id="kontak" className="mx-auto w-full max-w-2xl scroll-mt-24 px-6">
        <GlassCard tone="strong" className="text-center">
          <h2 className={`${HEADING_FONT} mb-3 text-2xl font-bold text-[#17263D]`}>
            Hubungi Tim SLR
          </h2>
          <div className="flex flex-col gap-1 text-sm text-slate-700">
            {get("phone") && <p>Telepon/WhatsApp: {get("phone")}</p>}
            {get("email") && <p>Email: {get("email")}</p>}
            {get("instagram") && (
              <a
                href={`https://instagram.com/${get("instagram").replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mx-auto mt-2 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/40 px-4 py-1.5 font-medium text-[#17263D] backdrop-blur-md transition hover:bg-white/60 active:bg-white/70"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="ig-gradient" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#FEDA75" />
                      <stop offset="35%" stopColor="#FA7E1E" />
                      <stop offset="60%" stopColor="#D62976" />
                      <stop offset="100%" stopColor="#962FBF" />
                    </linearGradient>
                  </defs>
                  <path
                    fill="url(#ig-gradient)"
                    d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881.001 1.44 1.44 0 01-2.881-.001z"
                  />
                </svg>
                @{get("instagram").replace(/^@/, "")}
              </a>
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
          <Link href="/privasi" className="hover:underline active:text-[#35C5D0]">
            Kebijakan Privasi
          </Link>
          <Link href="/syarat" className="hover:underline active:text-[#35C5D0]">
            Syarat &amp; Ketentuan
          </Link>
          <SmoothScrollLink id="kontak" className="hover:underline active:text-[#35C5D0]">
            Kontak
          </SmoothScrollLink>
        </div>
      </footer>
    </div>
  );
}
