"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ACK_STATEMENTS } from "@/lib/registration-input";
import { submitAdultRegistrationAction } from "@/app/daftar/dewasa/actions";

type Program = { id: string; name: string; description: string | null; requires_acknowledgement: boolean };

export function AdultRegistrationForm({
  programs,
  initialProgramId,
}: {
  programs: Program[];
  initialProgramId?: string;
}) {
  const [programId, setProgramId] = useState(initialProgramId ?? "");
  const selected = programs.find((p) => p.id === programId);

  return (
    <form action={submitAdultRegistrationAction} className="flex flex-col gap-4">
      {/* honeypot: real people never see or fill this */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Nama Lengkap</label>
        <GlassInput name="full_name" required autoComplete="name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Nomor WhatsApp</label>
        <GlassInput name="phone" type="tel" required autoComplete="tel" placeholder="08xxxxxxxxxx" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Email (untuk login)</label>
        <GlassInput name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Password</label>
        <GlassInput name="password" type="password" required minLength={8} autoComplete="new-password" />
        <p className="text-xs text-slate-500">Minimal 8 karakter.</p>
      </div>

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
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </GlassSelect>
        {selected?.description && <p className="text-xs text-slate-600">{selected.description}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          <p className="text-xs text-slate-500">
            Kami tidak meminta data medis. Bila ada penyesuaian yang perlu diketahui instruktur,
            admin akan membicarakannya langsung dengan Anda.
          </p>
        </fieldset>
      )}

      <GlassButton type="submit" className="!bg-[#35C5D0] mt-2 !text-white hover:!bg-[#2bb0ba]">
        Buat Akun &amp; Daftar
      </GlassButton>
    </form>
  );
}
