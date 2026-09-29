"use client";

import { useState } from "react";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { useIsAbsent } from "@/components/report-attendance";

// The notes field, but aware of the narrative cycle: on a required session it
// opens labeled as a periodic summary and becomes required (only while the
// session is actually marked hadir -- an izin/sakit session never demands
// one). A "Simpan sebagai Draft" button appears ONLY while it's required and
// still empty, so the pengajar has an escape hatch without losing the rest
// of the report; it disappears the moment there's something to finalize
// with, keeping every other session's form exactly as it was before.
export function NarrativeField({
  required,
  defaultValue = "",
}: {
  required: boolean;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const absent = useIsAbsent();
  const isRequired = required && !absent;
  const empty = value.trim().length === 0;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-slate-800">
        {required ? "Rangkuman Perkembangan Berkala" : "Catatan Pengajar (opsional)"}
      </label>
      {required && (
        <p className="text-xs text-slate-500">
          Rangkuman perkembangan personal dibuat secara berkala setelah beberapa laporan, untuk memberi orang tua
          gambaran perkembangan murid sejak laporan sebelumnya.
        </p>
      )}
      <GlassTextarea
        name="notes"
        rows={required ? 4 : 3}
        required={isRequired}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={required ? "Tuliskan rangkuman perkembangan murid sejak laporan sebelumnya..." : undefined}
      />
      {isRequired && empty && (
        <>
          <p role="alert" className="text-xs font-medium text-[#A3183C]">
            Rangkuman wajib diisi sebelum laporan ini bisa difinalisasi. Anda tetap bisa menyimpan sebagai draft dan
            melengkapinya nanti.
          </p>
          <GlassButton
            type="submit"
            name="intent"
            value="draft"
            formNoValidate
            className="w-fit self-start !bg-white/40 px-3 py-1.5 text-xs font-medium !text-slate-700 hover:!bg-white/60"
          >
            Simpan sebagai Draft
          </GlassButton>
        </>
      )}
    </div>
  );
}
