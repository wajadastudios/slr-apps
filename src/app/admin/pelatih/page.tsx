import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { createPelatihAction } from "./actions";

export default async function PelatihPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: pelatihList } = await supabase
    .from("users")
    .select("id, full_name, email, created_at")
    .eq("role", "pelatih")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Tambah Pelatih
        </h2>
        <form action={createPelatihAction} className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Nama
            </label>
            <GlassInput name="full_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Email
            </label>
            <GlassInput name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Password Awal
            </label>
            <GlassInput name="password" type="text" required minLength={6} />
          </div>
          {error && (
            <p className="sm:col-span-3 text-sm text-red-700 dark:text-red-300">
              {decodeURIComponent(error)}
            </p>
          )}
          <GlassButton type="submit" className="sm:col-span-3 sm:w-fit">
            Tambah Pelatih
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Pelatih
        </h2>
        <div className="flex flex-col gap-2">
          {(!pelatihList || pelatihList.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada pelatih.
            </p>
          )}
          {pelatihList?.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-2.5"
            >
              <span className="font-medium text-slate-900 dark:text-white">
                {p.full_name}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {p.email}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
