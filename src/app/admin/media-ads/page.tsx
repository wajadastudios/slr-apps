import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { uploadMediaAdAction, removeMediaAdAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const SLOTS = [
  {
    slot: "1",
    title: "Media Ads 1",
    hint: "Dipakai sebagai foto/video latar Hero (bagian paling atas landing page).",
    urlKey: "media_ad_1_url",
    accept: "image/*,video/*",
  },
  {
    slot: "2",
    title: "Media Ads 2",
    hint: "Dipakai sebagai foto/video di bagian Tentang Kami.",
    urlKey: "media_ad_2_url",
    accept: "image/*,video/*",
  },
  {
    slot: "video",
    title: "Video Ads SLR",
    hint: "Video promosi yang diputar otomatis (mute) di landing page, di atas Program Renang SLR. Maksimal durasi 60 detik.",
    urlKey: "video_ads_url",
    accept: "video/*",
  },
] as const;

export default async function MediaAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value");

  const get = (key: string) => settings?.find((s) => s.key === key)?.value || "";

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
      )}
      {saved && <p className="text-sm text-[#1a8f6f]">Tersimpan.</p>}

      {SLOTS.map(({ slot, title, hint, urlKey, accept }) => {
        const url = get(urlKey);
        const isVideo = url && /\.(mp4|webm|mov)$/i.test(url);
        return (
          <GlassCard key={slot}>
            <h2 className={HEADING}>{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{hint}</p>

            {url && (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/30 bg-white/40">
                {isVideo ? (
                  <video src={url} controls className="h-48 w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={title} className="h-48 w-full object-cover" />
                )}
              </div>
            )}

            <form
              action={uploadMediaAdAction}
              className="mt-4 flex flex-wrap items-end gap-4"
            >
              <input type="hidden" name="slot" value={slot} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Foto / Video baru</label>
                <input
                  type="file"
                  name="media"
                  accept={accept}
                  required
                  className="text-sm text-slate-700"
                />
              </div>
              <GlassButton
                type="submit"
                className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
              >
                Unggah &amp; Ganti
              </GlassButton>
              {url && (
                <GlassButton
                  formAction={removeMediaAdAction}
                  className="px-3 py-1.5 text-xs"
                >
                  Hapus
                </GlassButton>
              )}
            </form>
          </GlassCard>
        );
      })}
    </div>
  );
}
