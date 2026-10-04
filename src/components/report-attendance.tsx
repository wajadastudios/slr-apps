"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { GlassSelect } from "@/components/ui/glass-select";

// A missed session (izin / sakit) has no assessment. The attendance select and
// the sections that depend on it share this state, so choosing "Izin" or
// "Sakit" switches the indicator and record inputs off at once.
export const AbsentContext = createContext(false);

// Whether the currently-selected attendance is izin/sakit -- reactive to the
// live AttendanceSelect choice, not just the value the form was loaded with.
export function useIsAbsent(): boolean {
  return useContext(AbsentContext);
}
const SetAttendanceContext = createContext<(value: string) => void>(() => {});
const AttendanceValueContext = createContext("hadir");

export function AttendanceProvider({
  initial = "hadir",
  children,
}: {
  initial?: string;
  children: ReactNode;
}) {
  const [attendance, setAttendance] = useState(initial);
  return (
    <SetAttendanceContext.Provider value={setAttendance}>
      <AttendanceValueContext.Provider value={attendance}>
        <AbsentContext.Provider value={attendance !== "hadir"}>{children}</AbsentContext.Provider>
      </AttendanceValueContext.Provider>
    </SetAttendanceContext.Provider>
  );
}

export function AttendanceSelect({ initial = "hadir" }: { initial?: string }) {
  const setAttendance = useContext(SetAttendanceContext);
  return (
    <GlassSelect
      name="attendance"
      required
      defaultValue={initial}
      onChange={(e) => setAttendance(e.target.value)}
    >
      <option value="hadir">Hadir</option>
      <option value="izin">Izin</option>
      <option value="sakit">Sakit</option>
    </GlassSelect>
  );
}

// Shown only for "Izin": the coach states WHEN the family's message arrived.
// "Setelah saya tiba di kolam" sends the report to an admin, who decides
// whether the session still uses one session of the package (see
// 0046_izin_sesi_terpakai.sql). The coach never decides that themself, and
// never sees the word "hangus".
export function LateNoticeField({ initial = false }: { initial?: boolean }) {
  const attendance = useContext(AttendanceValueContext);
  if (attendance !== "izin") return null;
  const option = "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/60 bg-white/55 px-3 py-2 text-sm text-slate-700 has-[:checked]:border-[#35C5D0] has-[:checked]:bg-[#35C5D0]/10";
  return (
    <fieldset className="flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 text-sm font-medium text-slate-700">Kapan kabar izin diterima?</legend>
      <label className={option}>
        <input type="radio" name="late_notice" value="before" required defaultChecked={!initial} className="accent-[#35C5D0]" />
        Sebelum saya tiba di kolam
      </label>
      <label className={option}>
        <input type="radio" name="late_notice" value="after" required defaultChecked={initial} className="accent-[#35C5D0]" />
        Setelah saya tiba di kolam
      </label>
      <p className="text-xs text-slate-500">Admin akan meninjau izin yang diterima setelah pengajar tiba.</p>
    </fieldset>
  );
}

// Wraps the parts that only make sense when the participant attended. The
// children stay mounted (nothing typed is lost if attendance is changed back)
// but are inert and are not submitted while the session is missed.
export function PresentOnly({ children, note }: { children: ReactNode; note?: string }) {
  const absent = useContext(AbsentContext);
  return (
    <fieldset disabled={absent} className="min-w-0 border-0 p-0">
      {absent && (
        <p className="mb-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
          {note ?? "Sesi izin/sakit tidak memakai penilaian atau rekor."}
        </p>
      )}
      <div inert={absent} className={absent ? "opacity-50" : undefined}>
        {children}
      </div>
    </fieldset>
  );
}
