"use client";

import { useRef } from "react";

// "Pilih semua" for a list of checkboxes named `name` inside the same form.
export function SelectAll({ name, label = "Pilih semua" }: { name: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        ref={ref}
        type="checkbox"
        className="h-4 w-4"
        onChange={(e) => {
          const form = ref.current?.closest("form");
          form?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((box) => {
            box.checked = e.target.checked;
          });
        }}
      />
      {label}
    </label>
  );
}
