"use client";

import { useRef, useState } from "react";

// Server Actions send the whole multipart body (including any attached
// file) straight to the server in one request. On Vercel specifically, the
// platform enforces its own ~4.5MB hard ceiling on that body regardless of
// Next's own `serverActions.bodySizeLimit` config -- exceeding it gets the
// request rejected before the action ever runs, which the client sees as a
// generic "An unexpected response was received from the server" failure
// instead of a normal validation error. Kept a little under that ceiling
// for the rest of the multipart payload (scores, notes, etc).
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Same "Foto/Video" file input used on both the new-report and edit-report
 * forms, with a client-side total-size check so an oversized attachment is
 * caught with a clear message instead of crashing the save on submit. */
export function MediaFileInput({ label }: { label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleChange() {
    const files = inputRef.current?.files;
    if (!files || files.length === 0) {
      setError(null);
      return;
    }
    const total = Array.from(files).reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setError(
        `Ukuran file terlalu besar (${formatMb(total)} MB). Maksimal ${formatMb(MAX_TOTAL_BYTES)} MB total -- pilih file yang lebih kecil atau kompres dulu.`
      );
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setError(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-slate-800">{label}</label>
      <div className="rounded-2xl border border-dashed border-white/50 bg-white/30 px-4 py-3">
        <input
          ref={inputRef}
          type="file"
          name="media"
          multiple
          accept="image/*,video/*"
          onChange={handleChange}
          className="w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#35C5D0] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
