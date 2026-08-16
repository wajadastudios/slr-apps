import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";

export default async function Home() {
  const supabase = await createClient();

  const [
    { data: programs },
    { data: testimonials },
    { data: gallery },
    { data: settings },
  ] = await Promise.all([
    supabase.from("programs").select("name, description").order("name"),
    supabase
      .from("testimonials")
      .select("author_name, content, photo_url")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("gallery_items")
      .select("media_url, media_type, caption")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("site_settings").select("key, value"),
  ]);

  const get = (key: string) =>
    settings?.find((s) => s.key === key)?.value || "";

  return (
    <div className="flex min-h-screen flex-col gap-16 p-6 pb-20">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 pt-16 text-center">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white sm:text-5xl">
          Sari Les Renang
        </h1>
        <p className="max-w-xl text-lg text-slate-700 dark:text-slate-300">
          Les renang untuk bayi, ibu hamil, dan terapi air — dibimbing
          pelatih berpengalaman dengan laporan perkembangan setiap sesi.
        </p>
        <Link href="/daftar">
          <GlassButton className="px-8 py-3 text-base">
            Daftar Member Baru
          </GlassButton>
        </Link>
      </section>

      {/* Programs */}
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Program Kami
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {programs?.map((p) => (
            <GlassCard key={p.name}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {p.name}
              </h3>
              {p.description && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {p.description}
                </p>
              )}
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      {testimonials && testimonials.length > 0 && (
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
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
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Dokumentasi Kegiatan
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

      {/* Contact */}
      <section className="mx-auto w-full max-w-2xl">
        <GlassCard className="text-center">
          <h2 className="mb-3 text-2xl font-semibold text-slate-900 dark:text-white">
            Lokasi &amp; Kontak
          </h2>
          <div className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
            {get("address") && <p>{get("address")}</p>}
            {get("phone") && <p>Telepon: {get("phone")}</p>}
            {get("email") && <p>Email: {get("email")}</p>}
            {get("operating_hours") && <p>Jam Operasional: {get("operating_hours")}</p>}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/daftar">
              <GlassButton>Daftar Member Baru</GlassButton>
            </Link>
            <Link href="/login">
              <GlassButton>Masuk ke Portal</GlassButton>
            </Link>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
