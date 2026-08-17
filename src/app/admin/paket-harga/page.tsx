import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { createPackageAction, togglePackageActiveAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function PaketHargaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: programs }, { data: packages }] = await Promise.all([
    supabase.from("programs").select("id, name").order("name"),
    supabase
      .from("program_packages")
      .select("id, program_id, name, sessions_count, price, benefits, active")
      .order("sessions_count"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
      )}

      {programs?.map((program) => {
        const programPackages = (packages ?? []).filter(
          (p) => p.program_id === program.id
        );

        return (
          <GlassCard key={program.id}>
            <h2 className={`mb-4 ${HEADING}`}>{program.name}</h2>

            <form
              action={createPackageAction}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <input type="hidden" name="program_id" value={program.id} />
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
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">
                  Benefit (satu per baris)
                </label>
                <GlassTextarea name="benefits" rows={1} />
              </div>
              <GlassButton
                type="submit"
                className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba] sm:col-span-2 sm:w-fit lg:col-span-4"
              >
                Tambah Paket
              </GlassButton>
            </form>

            <div className="mt-4 flex flex-col gap-2">
              {programPackages.length === 0 && (
                <p className="text-sm text-slate-600">
                  Belum ada paket untuk program ini.
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
        );
      })}
    </div>
  );
}
