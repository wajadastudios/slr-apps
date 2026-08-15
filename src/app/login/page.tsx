"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";

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
    <div className="flex min-h-screen flex-1 items-center justify-center p-6">
      <GlassCard className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">
          Sari Les Renang
        </h1>
        <p className="mb-6 text-sm text-slate-700 dark:text-slate-300">
          Masuk ke portal Anda
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm text-slate-800 dark:text-slate-200">
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
            <label htmlFor="password" className="text-sm text-slate-800 dark:text-slate-200">
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

          {error && (
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          )}

          <GlassButton type="submit" disabled={loading} className="mt-2">
            {loading ? "Memproses..." : "Masuk"}
          </GlassButton>
        </form>
      </GlassCard>
    </div>
  );
}
