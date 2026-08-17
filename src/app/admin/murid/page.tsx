import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { createMuridAction } from "./actions";

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
        <form action={createMuridAction} className="grid gap-4 sm:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Anak</label>
            <GlassInput name="full_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Tanggal Lahir</label>
            <GlassInput name="birth_date" type="date" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Tempat Lahir</label>
            <GlassInput name="birth_place" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Orang Tua</label>
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
            <label className="text-sm text-slate-800">Program</label>
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
            <p className="text-sm text-red-700 sm:col-span-5">
              {decodeURIComponent(error)}
            </p>
          )}
          {(!parents || parents.length === 0) && (
            <p className="text-sm text-amber-700 sm:col-span-5">
              Belum ada akun orang tua — tambahkan dulu di halaman Orang Tua.
            </p>
          )}
          <GlassButton
            type="submit"
            disabled={!parents || parents.length === 0}
            className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba] sm:col-span-5 sm:w-fit"
          >
            Tambah Siswa
          </GlassButton>
        </form>
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
