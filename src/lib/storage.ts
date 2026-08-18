import "server-only";
import type { createClient } from "@/lib/supabase/server";

const BUCKET_MARKER = "/progress-media/";

export async function deleteStorageFileFromUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  url: string | null | undefined
) {
  if (!url) return;
  const idx = url.indexOf(BUCKET_MARKER);
  if (idx === -1) return;
  const path = decodeURIComponent(url.slice(idx + BUCKET_MARKER.length));
  if (!path) return;
  await supabase.storage.from("progress-media").remove([path]);
}
