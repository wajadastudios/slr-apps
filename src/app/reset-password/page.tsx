"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Session may already be established by the time this mounts.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/login"), 2000);
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

        {done ? (
          <p className="text-center text-sm text-[#1a8f6f]">
            Password berhasil diubah. Mengarahkan ke halaman masuk...
          </p>
        ) : !ready ? (
          <p className="text-center text-sm text-slate-600">
            Memverifikasi tautan reset password...
          </p>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-slate-700">
              Masukkan password baru Anda.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm text-slate-800">
                  Password Baru
                </label>
                <GlassInput
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
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
                {loading ? "Menyimpan..." : "Simpan Password Baru"}
              </GlassButton>
            </form>
          </>
        )}
      </GlassCard>
    </div>
  );
}
