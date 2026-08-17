import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { selfRegisterAction } from "./actions";

export default async function OrtuDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: children }, { data: programs }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, nickname, birth_date, program:program_id(name)")
      .order("full_name"),
    supabase
      .from("programs")
      .select("id, name")
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Anak Saya
      </h1>

      {(!children || children.length === 0) && (
        <GlassCard>
          <p className="text-sm text-slate-600">
            Belum ada data anak terdaftar.
          </p>
        </GlassCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children?.map((child) => {
          const program = child.program as unknown as { name: string } | null;
          return (
            <Link key={child.id} href={`/ortu/anak/${child.id}`}>
              <GlassCard className="transition-transform hover:scale-[1.02] hover:border-[#35C5D0]/50">
                <p className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
                  {child.nickname || child.full_name}
                </p>
                <p className="text-sm text-slate-600">
                  {program?.name ?? "Belum ada program"}
                </p>
              </GlassCard>
            </Link>
          );
        })}
      </div>

      <GlassCard>
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Daftarkan Diri Sendiri ke Kelas
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Untuk Anda sendiri (remaja/dewasa) yang ingin ikut kelas renang,
          bukan untuk anak.
        </p>
        <form
          action={selfRegisterAction}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Program</label>
            <GlassSelect name="program_id" required defaultValue="" className="min-w-[220px]">
              <option value="" disabled>
                Pilih program
              </option>
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton
            type="submit"
            disabled={!programs || programs.length === 0}
            className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
          >
            Daftarkan
          </GlassButton>
        </form>
        {error && (
          <p className="mt-2 text-sm text-red-700">{decodeURIComponent(error)}</p>
        )}
      </GlassCard>
    </div>
  );
}
