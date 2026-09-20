"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassButton } from "@/components/ui/glass-button";
import { ImageCropPicker } from "@/components/image-crop-picker";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/action-result";
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
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [readyName, setReadyName] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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

    const file = inputRef.current?.files?.[0];
    if (!file) {
      toast.error("Data belum tersimpan", "Pilih foto atau video terlebih dahulu.");
      return;
    }

    const media_type = file.type.startsWith("video") ? "video" : "image";
    if (media_type === "video" && file.size > MAX_VIDEO_BYTES) {
      toast.error("Data belum tersimpan", "Ukuran video maksimal 15MB.");
      return;
    }

    setBusy(true);
    try {
      const url = await replaceSlotFile(slot, file);
      await saveMediaAdSettingsAction(slot, url, media_type);
      formRef.current?.reset();
      setReadyName(null);
      toast.success("Media iklan berhasil disimpan");
      router.refresh();
    } catch (err) {
      toast.error("Data belum tersimpan", toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await removeSlotFile(slot);
      await removeMediaAdSettingsAction(slot);
      toast.success("Media iklan berhasil dihapus");
      router.refresh();
    } catch (err) {
      toast.error("Data belum dihapus", toUserMessage(err));
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

    </form>
  );
}
