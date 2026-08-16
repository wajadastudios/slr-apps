import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { createMuridAction } from "./actions";

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
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Tambah Murid
        </h2>
        <form action={createMuridAction} className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Nama Anak
            </label>
            <GlassInput name="full_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Tanggal Lahir
            </label>
            <GlassInput name="birth_date" type="date" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Orang Tua
            </label>
            <GlassSelect name="parent_id" required defaultValue="">
              <option value="" disabled>
                Pilih orang tua
              </option>
              {parents?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Program
            </label>
            <GlassSelect name="program_id" defaultValue="">
              <option value="">Belum dipilih</option>
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </GlassSelect>
          </div>
          {error && (
            <p className="sm:col-span-4 text-sm text-red-700 dark:text-red-300">
              {decodeURIComponent(error)}
            </p>
          )}
          {(!parents || parents.length === 0) && (
            <p className="sm:col-span-4 text-sm text-amber-700 dark:text-amber-300">
              Belum ada akun orang tua — tambahkan dulu di halaman Orang Tua.
            </p>
          )}
          <GlassButton
            type="submit"
            disabled={!parents || parents.length === 0}
            className="sm:col-span-4 sm:w-fit"
          >
            Tambah Murid
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Murid
        </h2>
        <div className="flex flex-col gap-2">
          {(!students || students.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada murid.
            </p>
          )}
          {students?.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5"
            >
              <span className="font-medium text-slate-900 dark:text-white">
                {s.full_name}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {(s.users as unknown as { full_name: string } | null)
                  ?.full_name ?? "-"}{" "}
                &middot;{" "}
                {(s.programs as unknown as { name: string } | null)?.name ??
                  "Belum ada program"}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
