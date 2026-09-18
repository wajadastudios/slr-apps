"use client";

import { useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";

export function AccountEditor({
  id,
  currentEmail,
  action,
}: {
  id: string;
  currentEmail: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-white/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-[#17263D] transition-colors hover:bg-white/60 active:bg-white/70"
      >
        Kelola Akun
      </button>
    );
  }

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-2 rounded-xl border border-[#35C5D0]/30 bg-white/50 p-3 sm:min-w-[280px]"
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-600">Email</label>
        <GlassInput
          name="email"
          type="email"
          defaultValue={currentEmail}
          required
          className="text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-600">
          Password Baru (kosongkan jika tidak diganti)
        </label>
        <GlassInput
          name="password"
          type="text"
          minLength={6}
          placeholder="Minimal 6 karakter"
          className="text-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white/50 active:bg-white/60"
        >
          Batal
        </button>
        <GlassButton
          type="submit"
          className="!bg-[#35C5D0] px-3 py-1.5 text-xs font-semibold !text-white hover:!bg-[#2bb0ba] active:!bg-[#2bb0ba]"
        >
          Simpan
        </GlassButton>
      </div>
    </form>
  );
}
