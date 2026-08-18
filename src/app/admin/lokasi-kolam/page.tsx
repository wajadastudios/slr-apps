import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { createPoolLocationAction, deletePoolLocationAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function LokasiKolamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("pool_locations")
    .select("id, name, maps_link, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Tambah Lokasi Kolam</h2>
        <form
          action={createPoolLocationAction}
          className="flex flex-wrap items-end gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Kolam</label>
            <GlassInput name="name" className="min-w-[200px]" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Link Embed Google Maps
            </label>
            <GlassInput
              name="maps_link"
              placeholder="https://www.google.com/maps/embed?..."
              className="min-w-[320px]"
              required
            />
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
          >
            Tambah
          </GlassButton>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Buka Google Maps &rarr; cari lokasi &rarr; Bagikan &rarr; Sematkan
          peta (Embed a map) &rarr; salin link dari atribut src iframe.
        </p>
        {error && (
          <p className="mt-3 text-sm text-red-700">
            {decodeURIComponent(error)}
          </p>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Lokasi</h2>
        <div className="flex flex-col gap-2">
          {(!locations || locations.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada lokasi kolam.</p>
          )}
          {locations?.map((loc) => (
            <div
              key={loc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/30 bg-white/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-[#17263D]">{loc.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {loc.maps_link}
                </p>
              </div>
              <form action={deletePoolLocationAction}>
                <input type="hidden" name="location_id" value={loc.id} />
                <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                  Hapus
                </GlassButton>
              </form>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
