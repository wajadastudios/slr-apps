"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/action-result";
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
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("transfer");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        payment_method: paymentMethod,
      });

      toast.success("Pembayaran gaji berhasil dicatat");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Data belum tersimpan", toUserMessage(err));
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
      <select
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value)}
        disabled={busy}
        className="rounded-lg border border-white/40 bg-white/60 px-2 py-1.5 text-xs text-slate-800"
      >
        <option value="transfer">Transfer</option>
        <option value="tunai">Tunai</option>
        <option value="lainnya">Lainnya</option>
      </select>
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
    </form>
  );
}
