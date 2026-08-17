import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { addGalleryItemAction, deleteGalleryItemAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function GaleriPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("gallery_items")
    .select("id, media_url, media_type, caption, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Tambah Galeri</h2>
        <form
          action={addGalleryItemAction}
          className="flex flex-wrap items-end gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Foto / Video</label>
            <input
              type="file"
              name="media"
              accept="image/*,video/*"
              required
              className="text-sm text-slate-700"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Keterangan (opsional)
            </label>
            <GlassInput name="caption" className="min-w-[220px]" />
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
          >
            Unggah
          </GlassButton>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-700">
            {decodeURIComponent(error)}
          </p>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Galeri</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(!items || items.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada foto/video.</p>
          )}
          {items?.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-white/30 bg-white/40"
            >
              {item.media_type === "video" ? (
                <video src={item.media_url} controls className="h-40 w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.media_url}
                  alt={item.caption ?? ""}
                  className="h-40 w-full object-cover"
                />
              )}
              <div className="flex items-center justify-between gap-2 p-3">
                <p className="truncate text-sm text-slate-700">
                  {item.caption ?? "-"}
                </p>
                <form action={deleteGalleryItemAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                    Hapus
                  </GlassButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
