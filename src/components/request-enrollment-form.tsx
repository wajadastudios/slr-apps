"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { PRIMARY_BUTTON } from "@/lib/ui-classes";
import { ACK_STATEMENTS } from "@/lib/registration-input";
import { requestEnrollmentAction } from "@/app/ortu/actions";

type Program = { id: string; name: string; requires_acknowledgement: boolean };

// A signed-in participant asks to join another program (e.g. Aquanatal next
// to Adult Swim). It only creates a pending registration; the admin then finds
// a schedule.
export function RequestEnrollmentForm({
  programs,
  takenProgramIds,
}: {
  programs: Program[];
  takenProgramIds: string[];
}) {
  const [programId, setProgramId] = useState("");
  const options = programs.filter((p) => !takenProgramIds.includes(p.id));
  const selected = options.find((p) => p.id === programId);

  if (options.length === 0) {
    return <p className="text-sm text-slate-600">Anda sudah terdaftar di semua program yang tersedia.</p>;
  }

  return (
    <ToastForm action={requestEnrollmentAction} resetOnSuccess className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Program</label>
          <GlassSelect
            name="program_id"
            required
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            glassChevron
          >
            <option value="" disabled>
              Pilih program
            </option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </GlassSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Pilihan jadwal (opsional)</label>
          <GlassInput name="preferred_schedule" placeholder="Contoh: Sabtu pagi" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Pilihan lokasi (opsional)</label>
          <GlassInput name="preferred_location" placeholder="Contoh: Kolam CDR" />
        </div>
      </div>

      {selected?.requires_acknowledgement && (
        <fieldset className="flex flex-col gap-2 rounded-2xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-4">
          <legend className="px-1 text-sm font-semibold text-[#17263D]">Konfirmasi peserta</legend>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {ACK_STATEMENTS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <label className="mt-1 flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" name="acknowledged" required className="mt-1 h-4 w-4" />
            <span>Saya telah membaca dan menyetujui pernyataan di atas.</span>
          </label>
        </fieldset>
      )}

      <GlassButton type="submit" className={`${PRIMARY_BUTTON} w-fit px-4 py-2 text-sm`}>
        Kirim Pendaftaran
      </GlassButton>
    </ToastForm>
  );
}
