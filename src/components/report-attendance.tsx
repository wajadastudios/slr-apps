"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { GlassSelect } from "@/components/ui/glass-select";

// A missed session (izin / sakit) has no assessment. The attendance select and
// the sections that depend on it share this state, so choosing "Izin" or
// "Sakit" switches the indicator and record inputs off at once.
const AbsentContext = createContext(false);
const SetAttendanceContext = createContext<(value: string) => void>(() => {});

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
      <AbsentContext.Provider value={attendance !== "hadir"}>{children}</AbsentContext.Provider>
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
