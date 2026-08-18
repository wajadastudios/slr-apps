"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { SLOT_KEYS, type SlotName } from "./slots";

// The actual file bytes are uploaded client-side straight to Supabase
// Storage (see upload-form.tsx) so they never pass through a Vercel
// Serverless Function — those cap request bodies at 4.5MB, well under
// what a 15MB video needs. These actions only ever receive small strings.

export async function saveMediaAdSettingsAction(
  slot: SlotName,
  url: string,
  mediaType: "image" | "video"
) {
  await requireAdmin();

  if (!(slot in SLOT_KEYS)) throw new Error("Slot tidak dikenal.");

  const supabase = await createClient();
  const keys = SLOT_KEYS[slot];
  const rows: { key: string; value: string }[] = [{ key: keys.url, value: url }];
  if (keys.type) rows.push({ key: keys.type, value: mediaType });

  const { error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/media-ads");
  revalidatePath("/");
}

export async function removeMediaAdSettingsAction(slot: SlotName) {
  await requireAdmin();

  if (!(slot in SLOT_KEYS)) throw new Error("Slot tidak dikenal.");

  const supabase = await createClient();
  const keys = SLOT_KEYS[slot];
  const rows: { key: string; value: string }[] = [{ key: keys.url, value: "" }];
  if (keys.type) rows.push({ key: keys.type, value: "" });

  const { error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/media-ads");
  revalidatePath("/");
}
