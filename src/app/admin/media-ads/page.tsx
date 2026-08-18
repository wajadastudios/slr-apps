import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { MediaAdUploadForm } from "./upload-form";
import type { SlotName } from "./slots";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const SLOTS: {
  slot: SlotName;
  title: string;
  hint: string;
  pixelHint: string;
  urlKey: string;
  accept: string;
  cropAspect?: number;
}[] = [
  {
    slot: "1",
    title: "Media Ads 1",
    hint: "Dipakai sebagai foto/video latar Hero (bagian paling atas landing page).",
    pixelHint:
      "Foto: minimal 1600×1200px (rasio ±4:3). Video: 1280×720–1920×1080 (16:9), maks 15MB & 60 detik.",
    urlKey: "media_ad_1_url",
    accept: "image/*,video/*",
    cropAspect: 4 / 3,
  },
  {
    slot: "2",
    title: "Media Ads 2",
    hint: "Dipakai sebagai foto/video di bagian Tentang Kami.",
    pixelHint:
      "Foto: minimal 800×1000px (potret/persegi). Video: 1280×720–1920×1080 (16:9), maks 15MB & 60 detik.",
    urlKey: "media_ad_2_url",
    accept: "image/*,video/*",
    cropAspect: 4 / 5,
  },
  {
    slot: "video",
    title: "Video Ads SLR",
    hint: "Video promosi yang diputar otomatis (mute) di landing page, di atas Program Renang SLR. Maksimal durasi 60 detik.",
    pixelHint: "Video: 1280×720 (HD) atau 1920×1080 (Full HD), rasio 16:9, maks 15MB.",
    urlKey: "video_ads_url",
    accept: "video/*",
  },
];

export default async function MediaAdsPage() {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value");

  const get = (key: string) => settings?.find((s) => s.key === key)?.value || "";

  return (
    <div className="flex flex-col gap-6">
      {SLOTS.map(({ slot, title, hint, pixelHint, urlKey, accept, cropAspect }) => {
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

            <MediaAdUploadForm
              slot={slot}
              accept={accept}
              hasExisting={Boolean(url)}
              cropAspect={cropAspect}
            />
            <p className="mt-2 text-xs text-slate-500">{pixelHint}</p>
          </GlassCard>
        );
      })}
    </div>
  );
}
