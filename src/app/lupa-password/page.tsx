"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";

export default function LupaPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg imageUrl={undefined} />
      <GlassCard className="w-full max-w-sm">
        <Link href="/" className="mb-4 flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={96} height={96} />
          <h1 className="font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]">
            Sari Les Renang
          </h1>
        </Link>

        {sent ? (
          <>
            <p className="text-center text-sm text-slate-700">
              Kalau email <strong>{email}</strong> terdaftar, tautan untuk
              atur ulang password sudah dikirim. Periksa kotak masuk (dan
              folder spam) Anda.
            </p>
            <Link
              href="/login"
              className="mt-6 block text-center text-sm text-[#35C5D0] hover:underline"
            >
              &larr; Kembali ke halaman masuk
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-slate-700">
              Masukkan email akun Anda, kami akan kirimkan tautan untuk atur
              ulang password.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm text-slate-800">
                  Email
                </label>
                <GlassInput
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-700">{error}</p>}

              <GlassButton
                type="submit"
                disabled={loading}
                className="!border-[#35C5D0]/60 !bg-[#35C5D0] mt-2 font-semibold !text-white hover:!bg-[#2bb0ba]"
              >
                {loading ? "Mengirim..." : "Kirim Tautan Reset"}
              </GlassButton>
            </form>

            <Link
              href="/login"
              className="mt-4 block text-center text-sm text-slate-600 hover:underline"
            >
              &larr; Kembali ke halaman masuk
            </Link>
          </>
        )}
      </GlassCard>
    </div>
  );
}
