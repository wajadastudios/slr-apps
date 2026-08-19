"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { ImageCropPicker } from "@/components/image-crop-picker";
import { updatePelatihProfileAction } from "./actions";

type Profile = {
  full_name: string | null;
  phone: string | null;
  bank_info: string | null;
  birth_place: string | null;
  birth_date: string | null;
  address: string | null;
  avatar_url: string | null;
};

async function uploadAvatar(userId: string, blob: Blob) {
  const supabase = createClient();
  const path = `avatars/pelatih-${userId}.jpg`;

  const { error } = await supabase.storage
    .from("progress-media")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("progress-media").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export function PengajarProfileForm({
  userId,
  profile,
}: {
  userId: string;
  profile: Profile | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    setCropFile(null);
    setBusy(true);
    setError(null);
    try {
      const url = await uploadAvatar(userId, blob);
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah foto.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleCropCancel() {
    setCropFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const formData = new FormData(e.currentTarget);
    try {
      await updatePelatihProfileAction({
        full_name: String(formData.get("full_name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        bank_info: String(formData.get("bank_info") ?? ""),
        birth_place: String(formData.get("birth_place") ?? ""),
        birth_date: String(formData.get("birth_date") ?? ""),
        address: String(formData.get("address") ?? ""),
        avatar_url: avatarUrl,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan profil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EEF9FB] text-2xl">
            👤
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Foto (opsional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={handleFileChange}
            className="text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#35C5D0] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
          />
        </div>
      </div>

      {cropFile && (
        <ImageCropPicker
          file={cropFile}
          aspect={1}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Nama Lengkap</label>
          <GlassInput name="full_name" defaultValue={profile?.full_name ?? ""} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Nomor WhatsApp</label>
          <GlassInput name="phone" defaultValue={profile?.phone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Tempat Lahir</label>
          <GlassInput name="birth_place" defaultValue={profile?.birth_place ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Tanggal Lahir</label>
          <GlassInput
            name="birth_date"
            type="date"
            defaultValue={profile?.birth_date ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm text-slate-800">Nomor Rekening</label>
          <GlassInput
            name="bank_info"
            placeholder="Contoh: BCA 1234567890 a.n. Nama"
            defaultValue={profile?.bank_info ?? ""}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Alamat</label>
        <GlassTextarea name="address" rows={2} defaultValue={profile?.address ?? ""} />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <GlassButton
        type="submit"
        disabled={busy}
        className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
      >
        {busy ? "Menyimpan..." : "Simpan Profil"}
      </GlassButton>
    </form>
  );
}
