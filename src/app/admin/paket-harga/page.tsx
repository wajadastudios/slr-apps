import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { EditableListField } from "@/components/ui/editable-list-field";
import { DeleteConfirm } from "@/components/admin/impact-confirm";
import { formatDate, rupiah } from "@/lib/admin/format";
import {
  createPackageAction,
  updatePackageAction,
  createPackagePriceVersionAction,
  togglePackageActiveAction,
  deletePackageAction,
} from "./actions";
import { bulkUpdateEnrollmentPriceAction } from "../tagihan/actions";
import { ToastForm } from "@/components/ui/toast-form";
import { SelectAll } from "@/components/admin/select-all";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const BADGE_OPTIONS = [
  { value: "", label: "Tidak ada" },
  { value: "promo", label: "Promo" },
  { value: "diskon", label: "Diskon" },
  { value: "best_deal", label: "Best Deal" },
  { value: "direkomendasikan", label: "Direkomendasikan" },
] as const;

const BADGE_LABELS: Record<string, string> = {
  promo: "Promo",
  diskon: "Diskon",
  best_deal: "Best Deal",
  direkomendasikan: "Direkomendasikan",
};

export default async function PaketHargaPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string; editPkg?: string }>;
}) {
  const { id, error, editPkg } = await searchParams;
  const supabase = await createClient();

  const [{ data: programs }, { data: packages }, { data: versions }, { data: enrollmentRows }, { data: lockRows }] = await Promise.all([
    supabase.from("programs").select("id, name, active").order("name"),
    supabase
      .from("program_packages")
      .select("id, program_id, name, sessions_count, price, currency, benefits, active, badge")
      .order("sessions_count"),
    supabase
      .from("package_price_versions")
      .select("id, program_package_id, price, currency, effective_from, effective_until, note")
      .order("effective_from", { ascending: false }),
    supabase
      .from("enrollments")
      .select("id, student_id, program_id, status, student:student_id(full_name)")
      .not("status", "in", "(cancelled,rejected)")
      .order("created_at"),
    supabase
      .from("enrollment_price_locks")
      .select("id, enrollment_id, program_package_id, price, currency, effective_from")
      .order("effective_from", { ascending: false }),
  ]);

  const selectedId = id || programs?.[0]?.id;
  const selectedProgram = programs?.find((p) => p.id === selectedId);
  const programPackages = (packages ?? []).filter(
    (p) => p.program_id === selectedId
  );
  const editingPackage = editPkg
    ? programPackages.find((p) => p.id === editPkg)
    : undefined;
  const isEditingPkg = Boolean(editingPackage);

  const versionsByPackage = new Map<string, NonNullable<typeof versions>>();
  for (const v of versions ?? []) {
    const list = versionsByPackage.get(v.program_package_id) ?? [];
    list.push(v);
    versionsByPackage.set(v.program_package_id, list);
  }

  // Latest lock per (enrollment, package) -- rows are already ordered
  // effective_from desc, so the first one seen per key wins.
  const lockByKey = new Map<string, NonNullable<typeof lockRows>[number]>();
  for (const l of lockRows ?? []) {
    const key = `${l.enrollment_id}:${l.program_package_id}`;
    if (!lockByKey.has(key)) lockByKey.set(key, l);
  }

  const programEnrollments = (enrollmentRows ?? [])
    .filter((e) => e.program_id === selectedId)
    .map((e) => ({ id: e.id, student_id: e.student_id, studentName: (e.student as unknown as { full_name: string } | null)?.full_name ?? "Peserta" }));

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

          <ToastForm
            action={isEditingPkg ? updatePackageAction : createPackageAction}
            resetOnSuccess={!isEditingPkg}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="program_id" value={selectedProgram.id} />
            {isEditingPkg && (
              <input type="hidden" name="package_id" value={editingPackage!.id} />
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Nama Paket</label>
                <GlassInput
                  name="name"
                  placeholder="Standar / Bundling"
                  defaultValue={editingPackage?.name ?? ""}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Jumlah Sesi</label>
                <GlassInput
                  name="sessions_count"
                  type="number"
                  min={1}
                  defaultValue={editingPackage?.sessions_count ?? ""}
                  required
                />
              </div>
              {!isEditingPkg && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">Harga awal (Rp)</label>
                  <GlassInput name="price" type="number" min={0} required />
                </div>
              )}
            </div>
            {isEditingPkg && (
              <p className="text-sm text-slate-600">
                Harga saat ini: <span className="font-semibold text-[#17263D]">{rupiah(editingPackage!.price)}</span>.
                Untuk mengubah harga, gunakan &ldquo;Buat versi harga baru&rdquo; di daftar paket di bawah -- perubahan
                harga di sini tidak mengubah tagihan yang sudah ada maupun harga peserta lama yang sudah terkunci.
              </p>
            )}
            <div className="flex flex-col gap-1.5 sm:w-56">
              <label className="text-sm text-slate-800">Badge</label>
              <GlassSelect
                name="badge"
                defaultValue={editingPackage?.badge ?? ""}
              >
                {BADGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </GlassSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Benefit</label>
              <EditableListField
                initialItems={editingPackage?.benefits ?? []}
                fieldName="benefits"
                itemLabel="Benefit"
                placeholder="Contoh: Gratis topi renang"
              />
            </div>
            {error && (
              <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
            )}
            <div className="flex items-center gap-3">
              <GlassButton
                type="submit"
                className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
              >
                {isEditingPkg ? "Simpan Perubahan" : "Tambah Paket"}
              </GlassButton>
              {isEditingPkg && (
                <a
                  href={`/admin/paket-harga?id=${selectedProgram.id}`}
                  className="text-sm text-slate-600 underline"
                >
                  Batal
                </a>
              )}
            </div>
          </ToastForm>

          <div className="mt-4 flex flex-col gap-2">
            {programPackages.length === 0 && (
              <p className="text-sm text-slate-600">
                Belum ada paket untuk kategori ini.
              </p>
            )}
            {programPackages.map((pkg) => {
              const history = versionsByPackage.get(pkg.id) ?? [];
              const enrollmentsOnThisPackage = programEnrollments.map((e) => ({
                ...e,
                lock: lockByKey.get(`${e.id}:${pkg.id}`),
              }));
              return (
                <div key={pkg.id} className="flex flex-col gap-1.5">
                  <DataRow
                    muted={!pkg.active}
                    primary={
                      <>
                        {pkg.name} &middot; {pkg.sessions_count} sesi &middot;
                        {rupiah(pkg.price)}
                        {pkg.badge && (
                          <span className="ml-2 rounded-full bg-[#35C5D0]/15 px-2 py-0.5 text-xs font-medium text-[#1a8f99]">
                            {BADGE_LABELS[pkg.badge]}
                          </span>
                        )}
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
                      <>
                        <a
                          href={`/admin/paket-harga?id=${selectedProgram.id}&editPkg=${pkg.id}`}
                          className="rounded-2xl border border-white/30 bg-white/30 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur-xl hover:bg-white/40"
                        >
                          Edit
                        </a>
                        <ToastForm action={togglePackageActiveAction} pendingLabel="Memproses...">
                          <input type="hidden" name="package_id" value={pkg.id} />
                          <input
                            type="hidden"
                            name="next_active"
                            value={(!pkg.active).toString()}
                          />
                          <GlassButton type="submit" className="px-4 py-2 text-sm">
                            {pkg.active ? "Nonaktifkan" : "Aktifkan"}
                          </GlassButton>
                        </ToastForm>
                        <ToastForm action={deletePackageAction} pendingLabel="Menghapus...">
                          <input type="hidden" name="package_id" value={pkg.id} />
                          <input
                            type="hidden"
                            name="program_id"
                            value={selectedProgram.id}
                          />
                          <DeleteConfirm
                            message="Hapus paket ini? Invoice yang sudah ada tidak akan terpengaruh."
                          >
                            Hapus
                          </DeleteConfirm>
                        </ToastForm>
                      </>
                    }
                  />

                  <details className="rounded-xl border border-white/30 bg-white/25 px-4 py-2 text-sm">
                    <summary className="cursor-pointer select-none font-medium text-[#0B6470]">
                      Buat versi harga baru &amp; riwayat harga ({history.length})
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <ToastForm action={createPackagePriceVersionAction} pendingLabel="Menyimpan..." className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="package_id" value={pkg.id} />
                        <input type="hidden" name="program_id" value={selectedProgram.id} />
                        <label className="flex flex-col gap-1 text-xs text-slate-600">
                          Harga baru (Rp)
                          <GlassInput name="price" type="number" min={0} required className="w-40" />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-600">
                          Berlaku mulai (opsional, default sekarang)
                          <GlassInput name="effective_from" type="date" className="w-44" />
                        </label>
                        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
                          Catatan (opsional)
                          <GlassInput name="note" placeholder="Contoh: Penyesuaian harga 2027" />
                        </label>
                        <GlassButton type="submit" className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">
                          Buat versi harga baru
                        </GlassButton>
                      </ToastForm>
                      <p className="text-xs text-slate-500">
                        Harga baru berlaku untuk pendaftar baru dan peserta yang belum pernah ditagih paket ini secara
                        otomatis. Peserta yang harganya sudah terkunci tidak berubah kecuali diperbarui lewat &ldquo;Perbarui
                        harga peserta&rdquo; di bawah.
                      </p>

                      {history.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {history.map((v) => (
                            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/40 px-3 py-1.5 text-xs text-slate-700">
                              <span>
                                {rupiah(v.price)} &middot; berlaku {formatDate(v.effective_from)}
                                {v.effective_until ? ` sampai ${formatDate(v.effective_until)}` : " (saat ini)"}
                              </span>
                              {v.note && <span className="text-slate-500">{v.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>

                  {enrollmentsOnThisPackage.length > 0 && (
                    <details className="rounded-xl border border-white/30 bg-white/25 px-4 py-2 text-sm">
                      <summary className="cursor-pointer select-none font-medium text-[#0B6470]">
                        Perbarui harga peserta untuk paket ini ({enrollmentsOnThisPackage.length} peserta aktif)
                      </summary>
                      <div className="mt-3 flex flex-col gap-3">
                        <p className="text-xs text-slate-600">
                          Perubahan akan berlaku mulai tagihan berikutnya. Invoice yang sudah dibuat tidak akan berubah.
                          Ini bukan aksi default -- centang hanya peserta yang memang harus dinaikkan harganya.
                        </p>
                        <ToastForm action={bulkUpdateEnrollmentPriceAction} pendingLabel="Menyimpan..." className="flex flex-col gap-3">
                          <input type="hidden" name="program_package_id" value={pkg.id} />
                          <input type="hidden" name="return" value={`/admin/paket-harga?id=${selectedProgram.id}`} />
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="flex flex-col gap-1 text-xs text-slate-600">
                              Harga baru untuk yang dipilih (Rp)
                              <GlassInput name="price" type="number" min={0} required className="w-40" />
                            </label>
                            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-600">
                              Alasan (opsional)
                              <GlassInput name="reason" placeholder="Contoh: Penyesuaian harga 2027" />
                            </label>
                          </div>
                          <SelectAll name="enrollment_ids" label="Pilih semua peserta di bawah" />
                          <div className="flex flex-col gap-1">
                            {enrollmentsOnThisPackage.map((e) => (
                              <label key={e.id} className="flex items-center gap-2 rounded-lg bg-white/40 px-3 py-1.5">
                                <input type="checkbox" name="enrollment_ids" value={e.id} className="h-4 w-4" />
                                <span className="text-slate-700">{e.studentName}</span>
                                <span className="text-xs text-slate-500">
                                  {e.lock ? `· harga terkunci saat ini: ${rupiah(e.lock.price)}` : "· belum pernah ditagih paket ini"}
                                </span>
                              </label>
                            ))}
                          </div>
                          <GlassButton type="submit" className="w-fit !bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">
                            Perbarui harga peserta terpilih
                          </GlassButton>
                        </ToastForm>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
