"use client";

import { useState } from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { createMuridAction } from "./actions";

export function MuridForm({
  parents,
  programs,
}: {
  parents: { id: string; full_name: string }[];
  programs: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"anak" | "diri">("anak");
  const canCreate = mode === "diri" || parents.length > 0;

  return (
    <form action={createMuridAction} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={mode} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-slate-800">Jenis Akun</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5">
            <input
              type="radio"
              name="mode_choice"
              checked={mode === "anak"}
              onChange={() => setMode("anak")}
            />
            <span className="text-sm text-slate-800">
              Anak dari orang tua terdaftar
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
              Akun mandiri (remaja/dewasa)
            </span>
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">
            {mode === "anak" ? "Nama Anak" : "Nama Lengkap"}
          </label>
          <GlassInput name="full_name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Tanggal Lahir</label>
          <GlassInput name="birth_date" type="date" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Tempat Lahir</label>
          <GlassInput name="birth_place" />
        </div>

        {mode === "anak" ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Orang Tua</label>
            <GlassSelect name="parent_id" required defaultValue="">
              <option value="" disabled>
                Pilih orang tua
              </option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </GlassSelect>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Email Akun</label>
              <GlassInput name="email" type="email" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Password Awal</label>
              <GlassInput name="password" type="text" required minLength={6} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Program</label>
          <GlassSelect name="program_id" defaultValue="">
            <option value="">Belum dipilih</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </GlassSelect>
        </div>
      </div>

      {mode === "anak" && parents.length === 0 && (
        <p className="text-sm text-amber-700">
          Belum ada akun orang tua — tambahkan dulu di halaman Orang Tua.
        </p>
      )}

      <GlassButton
        type="submit"
        disabled={!canCreate}
        className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
      >
        Tambah Siswa
      </GlassButton>
    </form>
  );
}
