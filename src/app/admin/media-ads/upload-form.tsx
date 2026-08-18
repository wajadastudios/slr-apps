"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassButton } from "@/components/ui/glass-button";
import { ImageCropPicker } from "@/components/image-crop-picker";
import { saveMediaAdSettingsAction, removeMediaAdSettingsAction } from "./actions";
import { MAX_VIDEO_BYTES, type SlotName } from "./slots";

async function replaceSlotFile(slot: SlotName, file: File) {
  const supabase = createClient();

  const { data: existing } = await supabase.storage
    .from("progress-media")
    .list("media-ads");

  const oldFiles =
    existing
      ?.filter((f) => f.name.startsWith(`slot-${slot}.`))
      .map((f) => `media-ads/${f.name}`) ?? [];

  if (oldFiles.length > 0) {
    await supabase.storage.from("progress-media").remove(oldFiles);
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `media-ads/slot-${slot}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage
    .from("progress-media")
    .getPublicUrl(path);

  return publicUrl.publicUrl;
}

async function removeSlotFile(slot: SlotName) {
  const supabase = createClient();

  const { data: existing } = await supabase.storage
    .from("progress-media")
    .list("media-ads");

  const oldFiles =
    existing
      ?.filter((f) => f.name.startsWith(`slot-${slot}.`))
      .map((f) => `media-ads/${f.name}`) ?? [];

  if (oldFiles.length > 0) {
    await supabase.storage.from("progress-media").remove(oldFiles);
  }
}

export function MediaAdUploadForm({
  slot,
  accept,
  hasExisting,
  cropAspect,
}: {
  slot: SlotName;
  accept: string;
  hasExisting: boolean;
  cropAspect?: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [readyName, setReadyName] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setReadyName(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image");
    if (isImage && cropAspect) {
      setCropFile(file);
    } else {
      setCropFile(null);
      setReadyName(file.name);
    }
  }

  function handleCropConfirm(blob: Blob) {
    if (!inputRef.current || !cropFile) return;
    const croppedName = cropFile.name.replace(/\.[^.]+$/, "") + ".jpg";
    const croppedFile = new File([blob], croppedName, { type: "image/jpeg" });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(croppedFile);
    inputRef.current.files = dataTransfer.files;

    setCropFile(null);
    setReadyName(croppedName);
  }

  function handleCropCancel() {
    setCropFile(null);
    setReadyName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Pilih foto atau video.");
      return;
    }

    const media_type = file.type.startsWith("video") ? "video" : "image";
    if (media_type === "video" && file.size > MAX_VIDEO_BYTES) {
      setError("Ukuran video maksimal 15MB.");
      return;
    }

    setBusy(true);
    try {
      const url = await replaceSlotFile(slot, file);
      await saveMediaAdSettingsAction(slot, url, media_type);
      formRef.current?.reset();
      setReadyName(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeSlotFile(slot);
      await removeMediaAdSettingsAction(slot);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleUpload}
      className="mt-4 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Foto / Video baru</label>
          <input
            ref={inputRef}
            type="file"
            name="media"
            accept={accept}
            required
            disabled={busy}
            onChange={handleFileChange}
            className="text-sm text-slate-700"
          />
          {readyName && (
            <span className="text-xs text-[#1a8f6f]">Siap diunggah: {readyName}</span>
          )}
        </div>
        <GlassButton
          type="submit"
          disabled={busy || Boolean(cropFile)}
          className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
        >
          {busy ? "Memproses..." : "Unggah & Ganti"}
        </GlassButton>
        {hasExisting && (
          <GlassButton
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="px-3 py-1.5 text-xs"
          >
            Hapus
          </GlassButton>
        )}
      </div>

      {cropFile && cropAspect && (
        <ImageCropPicker
          file={cropFile}
          aspect={cropAspect}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
