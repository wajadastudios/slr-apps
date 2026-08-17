"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError("Email atau password salah.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg imageUrl={undefined} />
      <GlassCard className="w-full max-w-sm">
        <Link href="/" className="mb-4 flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={48} height={48} />
          <h1 className="font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]">
            Sari Les Renang
          </h1>
        </Link>
        <p className="mb-6 text-center text-sm text-slate-700">
          Masuk ke portal Anda
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-slate-800">
              Password
            </label>
            <GlassInput
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <GlassButton
            type="submit"
            disabled={loading}
            className="!border-[#35C5D0]/60 !bg-[#35C5D0] mt-2 font-semibold !text-white hover:!bg-[#2bb0ba]"
          >
            {loading ? "Memproses..." : "Masuk"}
          </GlassButton>
        </form>

        <Link
          href="/lupa-password"
          className="mt-4 block text-center text-sm text-[#35C5D0] hover:underline"
        >
          Lupa password?
        </Link>

        <Link
          href="/"
          className="mt-4 block text-center text-sm text-slate-600 hover:underline"
        >
          &larr; Kembali ke Beranda
        </Link>
      </GlassCard>
    </div>
  );
}
