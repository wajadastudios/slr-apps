import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-6">
      <GlassCard className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Sari Les Renang
        </h1>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          Landing page publik akan hadir di tahap berikutnya. Untuk saat ini,
          silakan masuk ke portal Anda.
        </p>
        <Link href="/login" className="mt-6 inline-block">
          <GlassButton>Masuk</GlassButton>
        </Link>
      </GlassCard>
    </div>
  );
}
