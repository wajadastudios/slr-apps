"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassButton } from "@/components/ui/glass-button";
import { markPayrollPaidAction } from "./actions";

async function uploadProof(
  pelatihId: string,
  year: number,
  month: number,
  file: File
) {
  const supabase = createClient();

  const { data: existing } = await supabase.storage
    .from("progress-media")
    .list("payroll-proof");

  const prefix = `${pelatihId}-${year}-${month}`;
  const oldFiles =
    existing
      ?.filter((f) => f.name.startsWith(`${prefix}.`))
      .map((f) => `payroll-proof/${f.name}`) ?? [];
  if (oldFiles.length > 0) {
    await supabase.storage.from("progress-media").remove(oldFiles);
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `payroll-proof/${prefix}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage
    .from("progress-media")
    .getPublicUrl(path);

  return publicUrl.publicUrl;
}

export function MarkPaidForm({
  pelatihId,
  year,
  month,
  hadirCount,
  izinSakitCount,
  amount,
}: {
  pelatihId: string;
  year: number;
  month: number;
  hadirCount: number;
  izinSakitCount: number;
  amount: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const file = inputRef.current?.files?.[0];
      const proof_url = file
        ? await uploadProof(pelatihId, year, month, file)
        : null;

      await markPayrollPaidAction({
        pelatih_id: pelatihId,
        period_year: year,
        period_month: month,
        hadir_count: hadirCount,
        izin_sakit_count: izinSakitCount,
        amount,
        proof_url,
      });

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menandai dibayar.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <GlassButton
        type="button"
        onClick={() => setOpen(true)}
        className="!bg-[#35C5D0] px-3 py-1.5 text-xs !text-white hover:!bg-[#2bb0ba]"
      >
        Tandai Dibayar
      </GlassButton>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={busy}
        className="max-w-[160px] text-xs text-slate-700"
      />
      <GlassButton
        type="submit"
        disabled={busy}
        className="!bg-[#35C5D0] px-3 py-1.5 text-xs !text-white hover:!bg-[#2bb0ba]"
      >
        {busy ? "Menyimpan..." : "Konfirmasi"}
      </GlassButton>
      <GlassButton
        type="button"
        disabled={busy}
        onClick={() => setOpen(false)}
        className="px-3 py-1.5 text-xs"
      >
        Batal
      </GlassButton>
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </form>
  );
}
