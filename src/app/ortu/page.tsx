import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";

export default async function OrtuDashboardPage() {
  const supabase = await createClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, birth_date, program:program_id(name)")
    .order("full_name");

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
                  {child.full_name}
                </p>
                <p className="text-sm text-slate-600">
                  {program?.name ?? "Belum ada program"}
                </p>
              </GlassCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
