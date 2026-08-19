import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { createReferralCodeAction, toggleReferralCodeActiveAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

function formatRupiah(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export default async function AdminReferralPage({
  searchParams,
}: {
  searchParams: Promise<{ pelatih_id?: string; error?: string }>;
}) {
  const { pelatih_id, error } = await searchParams;
  const supabase = await createClient();

  const { data: pelatihList } = await supabase
    .from("users")
    .select("id, full_name, title, active")
    .eq("role", "pelatih")
    .order("full_name");

  const selectedId = pelatih_id || pelatihList?.[0]?.id;
  const selectedPelatih = pelatihList?.find((p) => p.id === selectedId);

  const { data: codes } = selectedId
    ? await supabase
        .from("referral_codes")
        .select("id, code, discount_type, discount_value, komisi_per_sesi, active, created_at")
        .eq("pelatih_id", selectedId)
        .order("created_at", { ascending: false })
    : { data: null };

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Pilih Pengajar</h2>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Pengajar</label>
            <GlassSelect name="pelatih_id" defaultValue={selectedId ?? ""} className="min-w-[220px]">
              {pelatihList?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title ? `${p.title} ${p.full_name}` : p.full_name}
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
        {(!pelatihList || pelatihList.length === 0) && (
          <p className="mt-3 text-sm text-slate-600">Belum ada pengajar.</p>
        )}
      </GlassCard>

      {selectedPelatih && (
        <GlassCard>
          <h2 className={`mb-4 ${HEADING}`}>
            Kode Referral — {selectedPelatih.title
              ? `${selectedPelatih.title} ${selectedPelatih.full_name}`
              : selectedPelatih.full_name}
          </h2>

          <form action={createReferralCodeAction} className="grid gap-4 sm:grid-cols-4">
            <input type="hidden" name="pelatih_id" value={selectedPelatih.id} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Kode</label>
              <GlassInput name="code" placeholder="SARISLR1" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Tipe Diskon</label>
              <GlassSelect name="discount_type" defaultValue="percent">
                <option value="percent">Persen (%)</option>
                <option value="fixed">Nominal (Rp)</option>
              </GlassSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Nilai Diskon</label>
              <GlassInput name="discount_value" type="number" min={0} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Komisi / Sesi (Rp)</label>
              <GlassInput name="komisi_per_sesi" type="number" min={0} required />
            </div>
            {error && (
              <p className="text-sm text-red-700 sm:col-span-4">
                {decodeURIComponent(error)}
              </p>
            )}
            <GlassButton
              type="submit"
              className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba] sm:col-span-4 sm:w-fit"
            >
              Tambah Kode
            </GlassButton>
          </form>

          <div className="mt-4 flex flex-col gap-2">
            {(!codes || codes.length === 0) && (
              <p className="text-sm text-slate-600">
                Belum ada kode referral untuk pengajar ini.
              </p>
            )}
            {codes?.map((c) => (
              <DataRow
                key={c.id}
                muted={!c.active}
                primary={
                  <>
                    {c.code}
                    {!c.active && (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Nonaktif
                      </span>
                    )}
                  </>
                }
                secondary={`Diskon ${
                  c.discount_type === "percent"
                    ? `${c.discount_value}%`
                    : formatRupiah(c.discount_value)
                } untuk siswa · Komisi ${formatRupiah(c.komisi_per_sesi)}/sesi`}
                action={
                  <form action={toggleReferralCodeActiveAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="pelatih_id" value={selectedPelatih.id} />
                    <input
                      type="hidden"
                      name="next_active"
                      value={(!c.active).toString()}
                    />
                    <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                      {c.active ? "Nonaktifkan" : "Aktifkan"}
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
