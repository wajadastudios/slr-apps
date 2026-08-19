"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassButton } from "@/components/ui/glass-button";
import { confirmTrialPaymentAction } from "@/app/trial/[token]/actions";

type PaymentMethod = "qris" | "transfer";

export function TrialPaymentForm({ token }: { token: string }) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("qris");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("token", token);

    setBusy(true);
    try {
      await confirmTrialPaymentAction(formData);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengonfirmasi pembayaran."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/50 px-4 py-2.5">
          <input
            type="radio"
            name="payment_method"
            value="qris"
            checked={paymentMethod === "qris"}
            onChange={() => setPaymentMethod("qris")}
          />
          <span className="text-sm text-slate-800">QRIS</span>
        </label>
        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/50 px-4 py-2.5">
          <input
            type="radio"
            name="payment_method"
            value="transfer"
            checked={paymentMethod === "transfer"}
            onChange={() => setPaymentMethod("transfer")}
          />
          <span className="text-sm text-slate-800">Transfer Manual</span>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Bukti Transfer</label>
        <input
          type="file"
          name="proof"
          accept="image/*"
          required
          disabled={busy}
          className="text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#35C5D0] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
        />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <GlassButton
        type="submit"
        disabled={busy}
        className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
      >
        {busy ? "Mengirim..." : "Konfirmasi Pembayaran"}
      </GlassButton>
    </form>
  );
}
