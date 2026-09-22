"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { setRememberCookie } from "@/lib/supabase/remember";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { EyeIcon } from "@/components/icons/eye-icon";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const deactivated = searchParams.get("nonaktif") === "1";

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

    // Marker cookie only — never the password itself. See remember.ts for
    // why the Supabase session cookie can't be used for this distinction.
    setRememberCookie(remember);

    // Return to where the user came from (e.g. a substitution approval link
    // opened from WhatsApp) instead of the role home. Only same-origin
    // relative paths, so a crafted ?next= cannot redirect off-site.
    const next = searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      router.replace(next);
      return;
    }

    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg />
      <GlassCard className="w-full max-w-sm">
        <Link href="/" className="mb-4 flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={96} height={96} />
          <h1 className="font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]">
            Sari Les Renang
          </h1>
        </Link>
        <p className="mb-6 text-center text-sm text-slate-700">
          Masuk ke akun Anda
        </p>

        {deactivated && (
          <p className="mb-4 rounded-xl border border-amber-300/60 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-800">
            Akun Anda sedang dinonaktifkan. Silakan hubungi admin SLR.
          </p>
        )}

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
            <div className="relative">
              <GlassInput
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#35C5D0]/70"
              >
                <EyeIcon open={showPassword} className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-5 w-5 shrink-0 rounded border-white/40 bg-white/30 text-[#35C5D0] accent-[#35C5D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#35C5D0]/70"
              />
              Ingat saya di perangkat ini
            </label>
            <p className="pl-[30px] text-xs text-slate-500">
              Jangan aktifkan jika menggunakan perangkat bersama.
            </p>
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
