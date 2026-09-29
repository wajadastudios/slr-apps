"use client";

import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { NARRATIVE_POLICY_LABEL } from "@/lib/programs";
import type { NarrativePolicy } from "@/lib/narrative-cycle";
import type { ActionState } from "@/lib/action-result";

const OPTIONS: NarrativePolicy[] = ["none", "every_4", "every_2", "every_1"];

// How often a pengajar must write a periodic narrative summary (beyond the
// notes field, which is always available and always optional every session).
export function NarrativePolicyForm({
  programId,
  initial,
  action,
}: {
  programId: string;
  initial: NarrativePolicy;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  return (
    <ToastForm action={action} className="flex flex-col gap-3" pendingLabel="Menyimpan...">
      <input type="hidden" name="id" value={programId} />
      <div className="flex max-w-xl flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-800">Kewajiban rangkuman naratif</label>
        <GlassSelect name="narrative_policy" defaultValue={initial} glassChevron>
          {OPTIONS.map((o) => (
            <option key={o} value={o}>
              {NARRATIVE_POLICY_LABEL[o]}
            </option>
          ))}
        </GlassSelect>
        <p className="text-xs text-slate-600">
          Kolom narasi selalu tersedia di setiap sesi dan selalu opsional secara default. Pengaturan ini hanya
          menambahkan kewajiban mengisi rangkuman pada sesi tertentu. Berlaku hanya untuk sesi bertanggal mulai 1
          Oktober 2026 -- laporan lama tidak berubah.
        </p>
      </div>
      <GlassButton type="submit" className="w-fit !bg-[#0E7C89] px-5 py-2 text-sm !text-white hover:!bg-[#0A6570]">
        Simpan
      </GlassButton>
    </ToastForm>
  );
}
