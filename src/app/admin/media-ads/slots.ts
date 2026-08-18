export const SLOT_KEYS = {
  "1": { url: "media_ad_1_url", type: "media_ad_1_type" },
  "2": { url: "media_ad_2_url", type: "media_ad_2_type" },
  video: { url: "video_ads_url", type: null },
} as const;

export type SlotName = keyof typeof SLOT_KEYS;

export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
