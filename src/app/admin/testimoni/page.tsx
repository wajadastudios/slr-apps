import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { createTestimonialAction, toggleTestimonialPublishedAction } from "./actions";

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

export default async function TestimoniPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: testimonials } = await supabase
    .from("testimonials")
    .select("id, author_name, content, rating, photo_url, published, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Tambah Testimoni
        </h2>
        <form action={createTestimonialAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800 dark:text-slate-200">
                Nama
              </label>
              <GlassInput name="author_name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800 dark:text-slate-200">
                Foto (opsional)
              </label>
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="text-sm text-slate-700 dark:text-slate-300"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Rating (opsional)
            </label>
            <GlassSelect name="rating" defaultValue="" className="sm:w-48">
              <option value="">Tanpa rating</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} Bintang
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Isi Testimoni
            </label>
            <GlassTextarea name="content" rows={3} required />
          </div>
          {error && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {decodeURIComponent(error)}
            </p>
          )}
          <GlassButton type="submit" className="w-fit">
            Tambah
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Testimoni
        </h2>
        <div className="flex flex-col gap-3">
          {(!testimonials || testimonials.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada testimoni.
            </p>
          )}
          {testimonials?.map((t) => (
            <div
              key={t.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                t.published
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-white/5 opacity-60"
              }`}
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {t.author_name}{" "}
                  {!t.published && (
                    <span className="text-xs text-slate-500">
                      (belum ditampilkan)
                    </span>
                  )}
                </p>
                {t.rating && (
                  <p className="text-sm">
                    <Stars rating={t.rating} />
                  </p>
                )}
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t.content}
                </p>
              </div>
              <form action={toggleTestimonialPublishedAction}>
                <input type="hidden" name="testimonial_id" value={t.id} />
                <input
                  type="hidden"
                  name="next_published"
                  value={(!t.published).toString()}
                />
                <GlassButton type="submit" className="px-4 py-2 text-sm">
                  {t.published ? "Sembunyikan" : "Tampilkan"}
                </GlassButton>
              </form>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
