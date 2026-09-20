import { createClient } from "@/lib/supabase/server";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { GroupAccordion } from "@/components/group-accordion";
import { MoveButtons } from "@/components/move-buttons";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { buildIndicatorConfig } from "@/lib/indicators";
import {
  createGroupAction,
  renameGroupAction,
  toggleGroupActiveAction,
  moveGroupAction,
  createIndicatorAction,
  renameIndicatorAction,
  moveIndicatorToGroupAction,
  moveIndicatorAction,
  toggleIndicatorActiveAction,
  deleteIndicatorAction,
} from "./indicator-actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

function Hidden({ programId, id }: { programId: string; id?: string }) {
  return (
    <>
      <input type="hidden" name="program_id" value={programId} />
      {id && <input type="hidden" name="id" value={id} />}
    </>
  );
}

// Admin-only structure editor. Pengajar never see this page; they only
// consume the result in the report form.
export async function IndicatorManager({ programId }: { programId: string }) {
  const supabase = await createClient();

  const [groupsRes, indicatorsRes, usedRes] = await Promise.all([
    supabase
      .from("indicator_groups")
      .select("id, name, sort_order, active")
      .eq("program_id", programId),
    supabase
      .from("indicators")
      .select("id, key, label, group_id, sort_order, active")
      .eq("program_id", programId),
    supabase.rpc("used_indicator_keys"),
  ]);

  const config = buildIndicatorConfig(groupsRes.data ?? [], indicatorsRes.data ?? []);
  const usedKeys = new Set<string>(
    ((usedRes.data as unknown as string[] | null) ?? []).map((k) =>
      typeof k === "string" ? k : String((k as { used_indicator_keys?: string }).used_indicator_keys ?? "")
    )
  );
  const groups = config.groups;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className={HEADING}>Kelompok Indikator</h3>
        <p className="mt-1 text-sm text-slate-600">
          Atur kelompok dan indikator penilaian untuk program ini. Pengajar hanya memakai struktur
          ini saat mengisi laporan. Indikator yang sudah pernah dinilai tidak dihapus permanen
          &mdash; gunakan <strong>Nonaktifkan</strong> agar hilang dari laporan baru tetapi tetap
          tampil di riwayat. Mengubah nama tidak membuat nilai lama hilang.
        </p>
      </div>

      <ToastForm
        action={createGroupAction}
        resetOnSuccess
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#35C5D0]/30 bg-[#EEF9FB]/70 p-3"
      >
        <Hidden programId={programId} />
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="text-xs text-slate-600">Kelompok baru</label>
          <GlassInput name="name" placeholder="Contoh: Gaya Bebas" required className="text-sm" />
        </div>
        <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-4 py-2 text-sm`}>
          Tambah Kelompok
        </GlassButton>
      </ToastForm>

      {groups.length === 0 && (
        <p className="text-sm text-slate-600">
          Belum ada kelompok indikator untuk program ini. Tambahkan kelompok pertama di atas.
        </p>
      )}

      {groups.map((group, gIndex) => (
        <GroupAccordion
          key={group.id}
          defaultOpen={gIndex === 0}
          muted={!group.active}
          header={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#17263D]">{group.name}</span>
              <span className="rounded-full bg-[#EEF9FB] px-2 py-0.5 text-xs text-slate-600">
                {group.indicators.length} indikator
              </span>
              {!group.active && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                  Nonaktif
                </span>
              )}
            </span>
          }
        >
          <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
            {/* group controls */}
            <div className="flex flex-wrap items-end gap-2 border-b border-white/50 pb-3">
              <ToastForm action={renameGroupAction} className="flex flex-1 flex-wrap items-end gap-2">
                <Hidden programId={programId} id={group.id} />
                <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                  <label className="text-xs text-slate-600">Nama kelompok</label>
                  <GlassInput name="name" defaultValue={group.name} required className="text-sm" />
                </div>
                <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-2 text-xs`}>
                  Simpan Nama
                </GlassButton>
              </ToastForm>
              <MoveButtons
                action={moveGroupAction}
                id={group.id}
                canUp={gIndex > 0}
                canDown={gIndex < groups.length - 1}
                fields={{ program_id: programId }}
              />
              <ToastForm action={toggleGroupActiveAction} pendingLabel="Memproses...">
                <Hidden programId={programId} id={group.id} />
                <input type="hidden" name="next_active" value={(!group.active).toString()} />
                <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-2 text-xs`}>
                  {group.active ? "Nonaktifkan Kelompok" : "Aktifkan Kelompok"}
                </GlassButton>
              </ToastForm>
            </div>

            {/* indicators */}
            <div className="flex flex-col gap-2">
              {group.indicators.length === 0 && (
                <p className="text-sm text-slate-500">Belum ada indikator di kelompok ini.</p>
              )}
              {group.indicators.map((ind, iIndex) => {
                const used = usedKeys.has(ind.key);
                return (
                  <div
                    key={ind.id}
                    className={`flex flex-wrap items-end gap-2 rounded-xl border border-white/60 bg-white/50 p-2.5 ${
                      ind.active ? "" : "opacity-70"
                    }`}
                  >
                    <ToastForm
                      action={renameIndicatorAction}
                      className="flex min-w-[200px] flex-1 flex-wrap items-end gap-2"
                    >
                      <Hidden programId={programId} id={ind.id} />
                      <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          Indikator
                          {!ind.active && (
                            <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium">
                              Nonaktif
                            </span>
                          )}
                          {used && (
                            <span className="rounded-full bg-[#FFC800]/25 px-1.5 text-[10px] font-medium text-[#8a6900]">
                              Sudah dipakai
                            </span>
                          )}
                        </label>
                        <GlassInput name="label" defaultValue={ind.label} required className="text-sm" />
                      </div>
                      <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-2 text-xs`}>
                        Simpan
                      </GlassButton>
                    </ToastForm>

                    {groups.length > 1 && (
                      <ToastForm
                        action={moveIndicatorToGroupAction}
                        pendingLabel="Memindahkan..."
                        className="flex items-end gap-2"
                      >
                        <Hidden programId={programId} id={ind.id} />
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-600">Pindah ke</label>
                          <GlassSelect name="group_id" defaultValue={group.id} className="min-w-[150px] text-sm">
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </GlassSelect>
                        </div>
                        <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-2 text-xs`}>
                          Pindah
                        </GlassButton>
                      </ToastForm>
                    )}

                    <div className="flex items-center gap-1.5">
                      <MoveButtons
                        action={moveIndicatorAction}
                        id={ind.id}
                        canUp={iIndex > 0}
                        canDown={iIndex < group.indicators.length - 1}
                        fields={{ program_id: programId, group_id: group.id }}
                      />
                      <ToastForm action={toggleIndicatorActiveAction} pendingLabel="Memproses...">
                        <Hidden programId={programId} id={ind.id} />
                        <input type="hidden" name="next_active" value={(!ind.active).toString()} />
                        <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-2 text-xs`}>
                          {ind.active ? "Nonaktifkan" : "Aktifkan"}
                        </GlassButton>
                      </ToastForm>
                      {!used && (
                        <ToastForm action={deleteIndicatorAction} pendingLabel="Menghapus...">
                          <Hidden programId={programId} id={ind.id} />
                          <ConfirmSubmitButton
                            message={`Hapus indikator "${ind.label}" secara permanen? Belum pernah dipakai pada laporan mana pun.`}
                            className="!border-red-300 !bg-red-500/10 px-3 py-2 text-xs !text-red-700 hover:!bg-red-500/20"
                          >
                            Hapus
                          </ConfirmSubmitButton>
                        </ToastForm>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <ToastForm
              action={createIndicatorAction}
              resetOnSuccess
              className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[#35C5D0]/40 p-2.5"
            >
              <Hidden programId={programId} />
              <input type="hidden" name="group_id" value={group.id} />
              <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                <label className="text-xs text-slate-600">Indikator baru di {group.name}</label>
                <GlassInput name="label" placeholder="Nama indikator" required className="text-sm" />
              </div>
              <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-4 py-2 text-xs`}>
                Tambah Indikator
              </GlassButton>
            </ToastForm>
          </div>
        </GroupAccordion>
      ))}
    </div>
  );
}
