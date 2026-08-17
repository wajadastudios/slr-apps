import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { createPelatihAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

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
        <h2 className={`mb-4 ${HEADING}`}>Tambah Pengajar</h2>
        <form action={createPelatihAction} className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama</label>
            <GlassInput name="full_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Email</label>
            <GlassInput name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Password Awal</label>
            <GlassInput name="password" type="text" required minLength={6} />
          </div>
          {error && (
            <p className="text-sm text-red-700 sm:col-span-3">
              {decodeURIComponent(error)}
            </p>
          )}
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba] sm:col-span-3 sm:w-fit"
          >
            Tambah Pengajar
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Pengajar</h2>
        <div className="flex flex-col gap-2">
          {(!pelatihList || pelatihList.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada pengajar.</p>
          )}
          {pelatihList?.map((p) => (
            <DataRow key={p.id} primary={p.full_name} secondary={p.email} />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
