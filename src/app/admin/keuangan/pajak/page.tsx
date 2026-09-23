import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/create-account";
import { jakartaToday, toISODate } from "@/lib/week";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, PageHeader, TabLinks, StatTile } from "@/components/admin/ui";
import { KeuanganTabs } from "../keuangan-tabs";
import { rupiah, formatDate } from "@/lib/admin/format";
import { syncAllToCashFlow } from "@/lib/finance/sync";
import { resolvePeriod, TAX_DISCLAIMER, NOT_OFFICIAL_NOTE, TAX_TYPE_LABEL, TAX_BASIS_LABEL, BUSINESS_FORM_LABEL } from "@/lib/finance/shared";
import { sumCashFlow, type CashFlowEntryLite } from "@/lib/finance/summary";
import { resolveEntityProfile, activeTaxSettingsOn, computeTaxEstimateLines, type TaxEntityProfileRow, type TaxSettingRow } from "@/lib/finance/tax";
import { saveEntityProfileAction, createTaxSettingAction, updateTaxSettingStatusAction } from "./actions";

type Params = { section?: string; from?: string; to?: string; error?: string };

export default async function PajakPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const section = ["profil", "pengaturan", "laporan"].includes(sp.section ?? "") ? (sp.section as string) : "profil";
  const supabase = await createClient();
  const todayISO = toISODate(jakartaToday());
  const period = resolvePeriod(sp, todayISO);

  const [{ data: profileRows }, { data: settingRows }] = await Promise.all([
    supabase.from("tax_entity_profile").select("*").order("effective_from", { ascending: false }),
    supabase.from("tax_settings").select("*").order("effective_from", { ascending: false }),
  ]);
  const profiles = (profileRows ?? []) as TaxEntityProfileRow[];
  const settings = (settingRows ?? []) as TaxSettingRow[];
  const currentProfile = resolveEntityProfile(profiles, todayISO);

  // ---- section C data (computed here so the page stays one component) ----
  let report: {
    omzetBruto: number; refund: number; pendapatanBersih: number; biayaOperasional: number; gajiPengajar: number; labaRugiInternal: number;
    belumBerkategori: number; cfNoAttachment: number; expenseNoAttachment: number;
    lines: ReturnType<typeof computeTaxEstimateLines>;
  } | null = null;

  if (section === "laporan") {
    await syncAllToCashFlow(supabase, session.user.id);
    const [{ data: cashFlowRows }, { data: expenseRows }] = await Promise.all([
      supabase
        .from("cash_flow_entries")
        .select("id, entry_date, direction, category, amount, status, program_id, location, attachment_url")
        .gte("entry_date", period.from)
        .lte("entry_date", period.to),
      supabase
        .from("operational_expenses")
        .select("id, attachment_url")
        .gte("expense_date", period.from)
        .lte("expense_date", period.to)
        .eq("payment_status", "dibayar"),
    ]);
    const cf = (cashFlowRows ?? []) as CashFlowEntryLite[];

    const omzetBruto = sumCashFlow(cf, "masuk", period.from, period.to, "pembayaran_murid");
    const refund = sumCashFlow(cf, "keluar", period.from, period.to, "refund");
    const pendapatanBersih = omzetBruto - refund;
    const gajiPengajar = sumCashFlow(cf, "keluar", period.from, period.to, "gaji_pengajar");
    const totalKeluar = sumCashFlow(cf, "keluar", period.from, period.to);
    const biayaOperasional = Math.max(0, totalKeluar - refund - gajiPengajar);
    const labaRugiInternal = pendapatanBersih - biayaOperasional - gajiPengajar;

    const belumBerkategori = cf.filter((e) => e.category === "lainnya" && e.status !== "dibatalkan").length;
    const cfNoAttachment = (cashFlowRows ?? []).filter((e) => !e.attachment_url).length;
    const expenseNoAttachment = (expenseRows ?? []).filter((e) => !e.attachment_url).length;

    const pkpActive = currentProfile?.pkp_status === "pkp";
    const active = activeTaxSettingsOn(settings, period.to);
    const lines = computeTaxEstimateLines(active, { omzet: omzetBruto, laba: labaRugiInternal, invoice: omzetBruto, biaya: biayaOperasional }, pkpActive);

    report = { omzetBruto, refund, pendapatanBersih, biayaOperasional, gajiPengajar, labaRugiInternal, belumBerkategori, cfNoAttachment, expenseNoAttachment, lines };
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Pajak & Kepatuhan" subtitle={TAX_DISCLAIMER} />
      <KeuanganTabs active="pajak" />
      <TabLinks
        label="Bagian pajak"
        active={section}
        tabs={[
          { key: "profil", label: "Profil Entitas", href: "/admin/keuangan/pajak?section=profil" },
          { key: "pengaturan", label: "Pengaturan Pajak", href: "/admin/keuangan/pajak?section=pengaturan" },
          { key: "laporan", label: "Laporan Estimasi", href: "/admin/keuangan/pajak?section=laporan" },
        ]}
      />

      {sp.error && <p role="alert" className="rounded-xl bg-[#FFE3EA] px-4 py-3 text-sm text-[#A3183C]">{decodeURIComponent(sp.error)}</p>}

      {section === "profil" && (
        <>
          <GlassCard className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Profil saat ini</h2>
            {currentProfile ? (
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-[#17263D]">{currentProfile.entity_name}</p>
                <p>{BUSINESS_FORM_LABEL[currentProfile.business_form] ?? currentProfile.business_form} &middot; NPWP: {currentProfile.npwp ?? "-"}</p>
                <p>Status PKP: <Badge tone={currentProfile.pkp_status === "pkp" ? "ok" : "neutral"}>{currentProfile.pkp_status === "pkp" ? "PKP" : "Belum PKP"}</Badge></p>
                <p className="text-xs text-slate-500">Berlaku sejak {formatDate(currentProfile.effective_from)}</p>
                {currentProfile.accountant_note && <p className="mt-1 text-xs text-slate-600">Catatan akuntan: {currentProfile.accountant_note}</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-600">Belum ada profil entitas. Isi form di bawah.</p>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Perbarui profil (versi baru)</h2>
            <p className="mb-3 text-xs text-slate-500">Menyimpan di sini tidak mengubah profil lama -- riwayat tetap tersimpan, hanya menambah versi baru yang berlaku sejak tanggal yang dipilih.</p>
            <ToastForm action={saveEntityProfileAction} resetOnSuccess className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Nama entitas
                  <GlassInput name="entity_name" defaultValue={currentProfile?.entity_name ?? ""} required />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Bentuk usaha
                  <GlassSelect name="business_form" defaultValue={currentProfile?.business_form ?? "individu"}>
                    {(Object.keys(BUSINESS_FORM_LABEL) as string[]).map((k) => <option key={k} value={k}>{BUSINESS_FORM_LABEL[k]}</option>)}
                  </GlassSelect>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  NPWP (opsional)
                  <GlassInput name="npwp" defaultValue={currentProfile?.npwp ?? ""} />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Status PKP
                  <GlassSelect name="pkp_status" defaultValue={currentProfile?.pkp_status ?? "belum_pkp"}>
                    <option value="belum_pkp">Belum PKP</option>
                    <option value="pkp">PKP</option>
                  </GlassSelect>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Bulan awal tahun buku
                  <GlassSelect name="fiscal_year_start_month" defaultValue={String(currentProfile?.fiscal_year_start_month ?? 1)}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                  </GlassSelect>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Tanggal efektif
                  <GlassInput name="effective_from" type="date" defaultValue={todayISO} required />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm text-slate-800">
                Catatan akuntan
                <GlassInput name="accountant_note" defaultValue={currentProfile?.accountant_note ?? ""} />
              </label>
              <GlassButton type="submit" className="w-fit !bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]">Simpan versi baru</GlassButton>
            </ToastForm>
          </GlassCard>

          {profiles.length > 0 && (
            <GlassCard className="flex flex-col gap-2">
              <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Riwayat profil</h2>
              {profiles.map((p) => (
                <div key={p.id} className="rounded-xl bg-white/40 px-3 py-2 text-xs text-slate-700">
                  {p.entity_name} &middot; {BUSINESS_FORM_LABEL[p.business_form] ?? p.business_form} &middot; {p.pkp_status === "pkp" ? "PKP" : "Belum PKP"} &middot; sejak {formatDate(p.effective_from)}
                </div>
              ))}
            </GlassCard>
          )}
        </>
      )}

      {section === "pengaturan" && (
        <>
          <GlassCard>
            <h2 className="mb-3 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Tambah pengaturan pajak</h2>
            <p className="mb-3 text-xs text-slate-500">
              Tarif tidak diisi otomatis oleh sistem -- kosongkan tarif bila belum ada angka pasti, dan tandai status konfirmasi setelah akuntan meninjau.
            </p>
            <ToastForm action={createTaxSettingAction} resetOnSuccess className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Nama pajak
                  <GlassInput name="tax_name" placeholder="Contoh: PPh Final UMKM" required />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Jenis
                  <GlassSelect name="tax_type" defaultValue="pph_estimasi">
                    {(Object.keys(TAX_TYPE_LABEL) as string[]).map((k) => <option key={k} value={k}>{TAX_TYPE_LABEL[k]}</option>)}
                  </GlassSelect>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Tarif (%) -- kosongkan bila belum pasti
                  <GlassInput name="rate_percent" type="number" step="0.001" min={0} />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Dasar pengenaan
                  <GlassSelect name="basis" defaultValue="omzet">
                    {(Object.keys(TAX_BASIS_LABEL) as string[]).map((k) => <option key={k} value={k}>{TAX_BASIS_LABEL[k]}</option>)}
                  </GlassSelect>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Berlaku mulai
                  <GlassInput name="effective_from" type="date" defaultValue={todayISO} required />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-800">
                  Berlaku sampai (opsional)
                  <GlassInput name="effective_until" type="date" />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm text-slate-800">
                Metode perhitungan (bila bukan persen sederhana)
                <GlassInput name="calculation_method" placeholder="Opsional, deskripsi bebas" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-800">
                Sumber aturan / catatan
                <GlassInput name="source_reference" placeholder="Contoh: UU HPP, saran akuntan tgl ..." />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="active" value="true" className="h-4 w-4" /> Aktifkan (ikut dihitung di laporan estimasi)
              </label>
              <GlassButton type="submit" className="w-fit !bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]">Simpan</GlassButton>
            </ToastForm>
          </GlassCard>

          <GlassCard className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Daftar pengaturan pajak</h2>
            {settings.length === 0 ? (
              <p className="text-sm text-slate-600">Belum ada pengaturan pajak. Semua estimasi pajak akan kosong sampai diisi.</p>
            ) : (
              settings.map((s) => (
                <div key={s.id} className="flex flex-col gap-1.5 rounded-xl border border-white/50 bg-white/50 px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#17263D]">
                      {s.tax_name} &middot; {TAX_TYPE_LABEL[s.tax_type]} &middot; {s.rate_percent != null ? `${s.rate_percent}%` : "tarif belum diisi"} dari {TAX_BASIS_LABEL[s.basis]}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={s.active ? "ok" : "neutral"}>{s.active ? "Aktif" : "Nonaktif"}</Badge>
                      <Badge tone={s.confirmation_status === "dikonfirmasi_akuntan" ? "ok" : "warn"}>
                        {s.confirmation_status === "dikonfirmasi_akuntan" ? "Dikonfirmasi akuntan" : "Perlu dikonfirmasi akuntan"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Berlaku {formatDate(s.effective_from)} {s.effective_until ? `sampai ${formatDate(s.effective_until)}` : "(tanpa batas)"}
                    {s.source_reference ? ` · ${s.source_reference}` : ""}
                  </p>
                  {s.note && <p className="text-xs text-slate-600">{s.note}</p>}
                  <details className="text-xs">
                    <summary className="cursor-pointer select-none text-[#0B6470]">Ubah status</summary>
                    <ToastForm action={updateTaxSettingStatusAction} pendingLabel="Menyimpan..." className="mt-1.5 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" name="active" value="true" defaultChecked={s.active} className="h-4 w-4" /> Aktif
                      </label>
                      <GlassSelect name="confirmation_status" defaultValue={s.confirmation_status} className="w-56">
                        <option value="perlu_dikonfirmasi_akuntan">Perlu dikonfirmasi akuntan</option>
                        <option value="dikonfirmasi_akuntan">Dikonfirmasi akuntan</option>
                      </GlassSelect>
                      <GlassInput name="effective_until" type="date" defaultValue={s.effective_until ?? ""} className="w-40" />
                      <GlassInput name="note" defaultValue={s.note ?? ""} placeholder="Catatan" className="w-48" />
                      <GlassButton type="submit" className="border border-white/40 bg-white/40 px-3 py-1.5 text-xs">Simpan</GlassButton>
                    </ToastForm>
                  </details>
                </div>
              ))
            )}
          </GlassCard>
        </>
      )}

      {section === "laporan" && report && (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-[#FFF1CC] px-4 py-3 text-sm font-semibold text-[#7A5400]">{TAX_DISCLAIMER}</p>

          <GlassCard>
            <h2 className="mb-2 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Periode</h2>
            <form className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="section" value="laporan" />
              <label className="flex flex-col gap-1 text-xs text-slate-600">Dari<GlassInput name="from" type="date" defaultValue={period.from} /></label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">Sampai<GlassInput name="to" type="date" defaultValue={period.to} /></label>
              <GlassButton type="submit" className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">Terapkan</GlassButton>
            </form>
          </GlassCard>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Omzet bruto (invoice lunas)" value={rupiah(report.omzetBruto)} />
            <StatTile label="Refund" value={rupiah(report.refund)} />
            <StatTile label="Pendapatan bersih" value={rupiah(report.pendapatanBersih)} />
            <StatTile label="Biaya operasional tercatat" value={rupiah(report.biayaOperasional)} />
            <StatTile label="Gaji pengajar" value={rupiah(report.gajiPengajar)} />
            <StatTile label="Laba/rugi internal (sederhana)" value={rupiah(report.labaRugiInternal)} />
          </div>

          <GlassCard className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Estimasi pajak</h2>
            {!currentProfile && <p className="text-sm text-slate-600">Belum ada profil entitas -- isi di tab Profil Entitas agar status PKP dapat dipakai.</p>}
            {report.lines.length === 0 ? (
              <p className="text-sm text-slate-600">Tidak ada pengaturan pajak aktif untuk periode ini.</p>
            ) : (
              report.lines.map((l) => (
                <div key={l.setting.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/40 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-[#17263D]">{l.setting.tax_name} ({TAX_TYPE_LABEL[l.setting.tax_type]})</p>
                    <p className="text-xs text-slate-500">
                      {l.setting.rate_percent != null ? `${l.setting.rate_percent}% × ${TAX_BASIS_LABEL[l.setting.basis]} (${rupiah(l.basisAmount)})` : "Tarif belum diisi -- lihat metode perhitungan manual"}
                      {l.setting.confirmation_status !== "dikonfirmasi_akuntan" ? " · perlu dikonfirmasi akuntan" : ""}
                    </p>
                  </div>
                  <span className="font-semibold text-[#17263D]">{l.estimatedAmount != null ? rupiah(l.estimatedAmount) : "-"}</span>
                </div>
              ))
            )}
            {currentProfile?.pkp_status !== "pkp" && (
              <p className="text-xs text-slate-500">PPN tidak diestimasi karena status PKP saat ini &ldquo;Belum PKP&rdquo;.</p>
            )}
          </GlassCard>

          <GlassCard className="flex flex-col gap-1.5 text-sm text-slate-700">
            <p>Transaksi kategori &ldquo;Lainnya&rdquo; (perlu ditinjau kategorinya): <strong>{report.belumBerkategori}</strong></p>
            <p>Transaksi arus kas tanpa lampiran bukti: <strong>{report.cfNoAttachment}</strong></p>
            <p>Biaya dibayar tanpa lampiran bukti: <strong>{report.expenseNoAttachment}</strong></p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{NOT_OFFICIAL_NOTE}</p>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
