import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { DataRow } from "@/components/ui/data-row";
import { MuridForm } from "./murid-form";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function MuridPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: students }, { data: parents }, { data: programs }] =
    await Promise.all([
      supabase
        .from("students")
        .select(
          "id, full_name, birth_date, users:parent_id(full_name), programs:program_id(name)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "ortu")
        .order("full_name"),
      supabase.from("programs").select("id, name").order("name"),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Tambah Siswa</h2>
        <MuridForm parents={parents ?? []} programs={programs ?? []} />
        {error && (
          <p className="mt-3 text-sm text-red-700">{decodeURIComponent(error)}</p>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Siswa</h2>
        <div className="flex flex-col gap-2">
          {(!students || students.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada siswa.</p>
          )}
          {students?.map((s) => (
            <DataRow
              key={s.id}
              primary={s.full_name}
              secondary={
                <>
                  {(s.users as unknown as { full_name: string } | null)
                    ?.full_name ?? "-"}{" "}
                  &middot;{" "}
                  {(s.programs as unknown as { name: string } | null)
                    ?.name ?? "Belum ada program"}
                </>
              }
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
