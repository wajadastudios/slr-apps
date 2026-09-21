"use client";

import { useState } from "react";
import { GlassSelect } from "@/components/ui/glass-select";
import { ToastForm } from "@/components/ui/toast-form";
import { ImpactConfirm } from "@/components/admin/impact-confirm";
import { AUDIENCE_OPTIONS, type Audience } from "@/lib/program-audience";
import type { ActionState } from "@/lib/action-result";

// Which registration form lists this program. Nothing is saved on the spot:
// a change first goes through a confirmation that says what it does (and does
// not) affect. With no change there is nothing to confirm.
export function AudienceForm({
  programId,
  initial,
  relatedCount,
  action,
}: {
  programId: string;
  initial: Audience;
  // participants / registrations that already belong to this program
  relatedCount: number;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [value, setValue] = useState<Audience>(initial);
  const changed = value !== initial;
  const current = AUDIENCE_OPTIONS.find((o) => o.value === value) ?? AUDIENCE_OPTIONS[0];

  return (
    <ToastForm action={action} className="flex flex-col gap-3" pendingLabel="Menyimpan...">
      <input type="hidden" name="id" value={programId} />
      <div className="flex max-w-xl flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-800">Siapa yang dapat mendaftar ke program ini?</label>
        <GlassSelect name="audience" value={value} onChange={(e) => setValue(e.target.value as Audience)} glassChevron>
          {AUDIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </GlassSelect>
        <p aria-live="polite" className="text-sm font-medium text-[#0B6470]">
          {current.description}
        </p>
        <p className="text-xs text-slate-600">
          Pengaturan ini menentukan di form pendaftaran mana program tampil. Pengaturan ini tidak mengubah peserta aktif,
          jadwal, tagihan, laporan, atau data historis.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {changed ? (
          <ImpactConfirm
            label="Simpan perubahan"
            title="Ubah jalur pendaftaran program?"
            impacts={[]}
            primary
            confirmLabel="Simpan perubahan"
          >
            <p className="text-sm text-slate-700">
              Perubahan ini akan memengaruhi tempat program tampil untuk pendaftar baru. Peserta aktif, jadwal, tagihan,
              laporan, dan data historis tidak akan berubah.
            </p>
            {relatedCount > 0 && (
              <p className="rounded-xl bg-[#DDF3F6] px-3 py-2 text-sm font-medium text-[#0B6470]">
                Program ini memiliki {relatedCount} peserta atau pendaftar terkait. Perubahan hanya berlaku untuk
                pendaftaran baru.
              </p>
            )}
          </ImpactConfirm>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex min-h-10 items-center rounded-2xl border border-white/40 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-500"
          >
            Simpan perubahan
          </button>
        )}
        {!changed && <span className="text-xs text-slate-500">Belum ada perubahan.</span>}
      </div>
    </ToastForm>
  );
}
