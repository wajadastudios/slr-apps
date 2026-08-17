"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { submitRegistrationAction } from "@/app/daftar/actions";

type Mode = "anak" | "diri";

export function RegistrationForm({
  programs,
}: {
  programs: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<Mode>("anak");
  const [selfName, setSelfName] = useState("");

  return (
    <form action={submitRegistrationAction} className="flex flex-col gap-4">
      <input type="hidden" name="registration_type" value={mode} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Mendaftar sebagai</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5">
            <input
              type="radio"
              name="mode_choice"
              checked={mode === "anak"}
              onChange={() => setMode("anak")}
            />
            <span className="text-sm text-slate-800">
              Orang tua, untuk anak saya
            </span>
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5">
            <input
              type="radio"
              name="mode_choice"
              checked={mode === "diri"}
              onChange={() => setMode("diri")}
            />
            <span className="text-sm text-slate-800">
              Untuk diri sendiri (remaja/dewasa)
            </span>
          </label>
        </div>
      </div>

      {mode === "anak" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Anak/Peserta</label>
            <GlassInput name="child_name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nama Orang Tua</label>
            <GlassInput name="parent_name" required />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Nama Lengkap</label>
          <GlassInput
            name="child_name"
            required
            value={selfName}
            onChange={(e) => setSelfName(e.target.value)}
          />
          <input type="hidden" name="parent_name" value={selfName} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Email</label>
        <GlassInput name="parent_email" type="email" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">
          Nomor Telepon/WhatsApp
        </label>
        <GlassInput name="parent_phone" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Program</label>
        <GlassSelect name="program_id" required defaultValue="">
          <option value="" disabled>
            Pilih program
          </option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </GlassSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">
          Jadwal yang Diminati (opsional)
        </label>
        <GlassInput name="preferred_schedule" placeholder="Contoh: Sabtu pagi" />
      </div>

      <GlassButton
        type="submit"
        className="!bg-[#35C5D0] mt-2 !text-white hover:!bg-[#2bb0ba]"
      >
        Kirim Pendaftaran
      </GlassButton>
    </form>
  );
}
