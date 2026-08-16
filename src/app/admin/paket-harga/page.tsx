import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { createPackageAction, togglePackageActiveAction } from "./actions";

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
        <p className="text-sm text-red-700 dark:text-red-300">
          {decodeURIComponent(error)}
        </p>
      )}

      {programs?.map((program) => {
        const programPackages = (packages ?? []).filter(
          (p) => p.program_id === program.id
        );

        return (
          <GlassCard key={program.id}>
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
              {program.name}
            </h2>

            <form
              action={createPackageAction}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <input type="hidden" name="program_id" value={program.id} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800 dark:text-slate-200">
                  Nama Paket
                </label>
                <GlassInput name="name" placeholder="Standar / Bundling" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800 dark:text-slate-200">
                  Jumlah Sesi
                </label>
                <GlassInput name="sessions_count" type="number" min={1} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800 dark:text-slate-200">
                  Harga (Rp)
                </label>
                <GlassInput name="price" type="number" min={0} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800 dark:text-slate-200">
                  Benefit (satu per baris)
                </label>
                <GlassTextarea name="benefits" rows={1} />
              </div>
              <GlassButton
                type="submit"
                className="sm:col-span-2 lg:col-span-4 sm:w-fit"
              >
                Tambah Paket
              </GlassButton>
            </form>

            <div className="mt-4 flex flex-col gap-2">
              {programPackages.length === 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Belum ada paket untuk program ini.
                </p>
              )}
              {programPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 ${
                    pkg.active
                      ? "border-white/20 bg-white/10"
                      : "border-white/10 bg-white/5 opacity-60"
                  }`}
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {pkg.name} &middot; {pkg.sessions_count} sesi &middot; Rp
                      {Number(pkg.price).toLocaleString("id-ID")}
                      {!pkg.active && (
                        <span className="ml-2 text-xs text-slate-500">
                          (nonaktif)
                        </span>
                      )}
                    </p>
                    {pkg.benefits && pkg.benefits.length > 0 && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {pkg.benefits.join(" · ")}
                      </p>
                    )}
                  </div>
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
                </div>
              ))}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
