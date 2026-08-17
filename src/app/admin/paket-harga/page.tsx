import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { EditableListField } from "@/components/ui/editable-list-field";
import { createPackageAction, togglePackageActiveAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function PaketHargaPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const supabase = await createClient();

  const [{ data: programs }, { data: packages }] = await Promise.all([
    supabase.from("programs").select("id, name, active").order("name"),
    supabase
      .from("program_packages")
      .select("id, program_id, name, sessions_count, price, benefits, active")
      .order("sessions_count"),
  ]);

  const selectedId = id || programs?.[0]?.id;
  const selectedProgram = programs?.find((p) => p.id === selectedId);
  const programPackages = (packages ?? []).filter(
    (p) => p.program_id === selectedId
  );

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Pilih Kategori</h2>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Kategori/Program</label>
            <GlassSelect
              name="id"
              defaultValue={selectedId ?? ""}
              className="min-w-[220px]"
            >
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.active ? " (nonaktif)" : ""}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
          >
            Tampilkan
          </GlassButton>
        </form>
        {(!programs || programs.length === 0) && (
          <p className="mt-3 text-sm text-slate-600">
            Belum ada kategori/program — buat dulu di halaman Program.
          </p>
        )}
      </GlassCard>

      {selectedProgram && (
        <GlassCard>
          <h2 className={`mb-4 ${HEADING}`}>{selectedProgram.name}</h2>

          <form
            action={createPackageAction}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="program_id" value={selectedProgram.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Nama Paket</label>
                <GlassInput name="name" placeholder="Standar / Bundling" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Jumlah Sesi</label>
                <GlassInput name="sessions_count" type="number" min={1} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Harga (Rp)</label>
                <GlassInput name="price" type="number" min={0} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Benefit</label>
              <EditableListField
                initialItems={[]}
                fieldName="benefits"
                itemLabel="Benefit"
                placeholder="Contoh: Gratis topi renang"
              />
            </div>
            {error && (
              <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
            )}
            <GlassButton
              type="submit"
              className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
            >
              Tambah Paket
            </GlassButton>
          </form>

          <div className="mt-4 flex flex-col gap-2">
            {programPackages.length === 0 && (
              <p className="text-sm text-slate-600">
                Belum ada paket untuk kategori ini.
              </p>
            )}
            {programPackages.map((pkg) => (
              <DataRow
                key={pkg.id}
                muted={!pkg.active}
                primary={
                  <>
                    {pkg.name} &middot; {pkg.sessions_count} sesi &middot;
                    Rp{Number(pkg.price).toLocaleString("id-ID")}
                    {!pkg.active && (
                      <span className="ml-2 text-xs text-slate-500">
                        (nonaktif)
                      </span>
                    )}
                  </>
                }
                secondary={
                  pkg.benefits && pkg.benefits.length > 0
                    ? pkg.benefits.join(" · ")
                    : undefined
                }
                action={
                  <form action={togglePackageActiveAction}>
                    <input type="hidden" name="package_id" value={pkg.id} />
                    <input
                      type="hidden"
                      name="next_active"
                      value={(!pkg.active).toString()}
                    />
                    <GlassButton type="submit" className="px-4 py-2 text-sm">
                      {pkg.active ? "Nonaktifkan" : "Aktifkan"}
                    </GlassButton>
                  </form>
                }
              />
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
