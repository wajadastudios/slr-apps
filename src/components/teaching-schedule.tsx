"use client";

import { useState } from "react";
import Link from "next/link";
import { AccordionItem } from "@/components/ui/accordion";
import { GHOST_BUTTON } from "@/lib/ui-classes";
import {
  daySummary,
  namesPreview,
  reportHref,
  type DaySchedule,
  type SessionItem,
  type SessionStatus,
  type StudentSession,
} from "@/lib/teaching-schedule";

const BADGE: Record<Exclude<SessionStatus, "mendatang">, { label: string; className: string }> = {
  belum: { label: "Belum diisi", className: "bg-[#FFF3C4] text-[#7a5c00]" },
  tersimpan: { label: "Tersimpan", className: "bg-[#DDF7EE] text-[#0f6b52]" },
  izin: { label: "Izin", className: "bg-slate-200 text-slate-600" },
  sakit: { label: "Sakit", className: "bg-slate-200 text-slate-600" },
};

const CTA_PRIMARY =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#35C5D0] px-4 text-sm font-semibold text-white shadow-[0_3px_10px_rgba(53,197,208,0.35)] transition-all duration-200 hover:bg-[#22B8C7] active:scale-[0.98] active:bg-[#1597A3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0] focus-visible:ring-offset-2 focus-visible:ring-offset-white/60";
const CTA_SECONDARY = `inline-flex min-h-10 items-center justify-center rounded-xl border border-[#35C5D0]/40 bg-white/50 px-4 text-sm font-medium text-[#1597A3] ${GHOST_BUTTON}`;

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === "mendatang") return null;
  const b = BADGE[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${b.className}`}>
      {b.label}
    </span>
  );
}

// One action per child: "Isi Laporan" is the only turquoise button, saved
// reports get a quiet "Lihat" so the eye lands on what still needs doing.
function StudentAction({ s }: { s: StudentSession }) {
  const href = reportHref(s.studentId, s.status, s.date);
  return s.status === "belum" ? (
    <Link href={href} className={CTA_PRIMARY}>
      Isi Laporan
    </Link>
  ) : (
    <Link href={href} className={CTA_SECONDARY}>
      Lihat
    </Link>
  );
}

function focusLine(s: StudentSession): string | null {
  if (s.focus) return `Fokus terakhir: ${s.focus}`;
  return s.hasReport ? "Laporan terakhir tersedia" : null;
}

function PrivateRow({ item }: { item: SessionItem }) {
  const s = item.students[0];
  const focus = focusLine(s);

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
        <span className="pt-0.5 font-[family-name:var(--font-quicksand)] text-base font-bold tabular-nums text-[#17263D]">
          {item.time}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#17263D]">{item.title}</p>
          <p className="text-sm text-slate-700">
            {s.name}
            {focus && <span className="text-slate-500"> · {focus}</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pl-[3.75rem] sm:pl-0">
        <StatusBadge status={s.status} />
        <StudentAction s={s} />
      </div>
    </li>
  );
}

function GroupRow({ item }: { item: SessionItem }) {
  const [open, setOpen] = useState(false);
  const total = item.students.length;
  const filled = item.students.filter((s) => s.status !== "belum" && s.status !== "mendatang").length;
  const pending = item.students.filter((s) => s.status === "belum").length;
  const showProgress = item.students.some((s) => s.status !== "mendatang");

  return (
    <li className="py-1.5">
      <AccordionItem
        variant="ortu"
        chevronSize="sm"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="rounded-2xl border border-[#35C5D0]/25 bg-[#EEF9FB]/55"
        headerClassName="min-h-16 rounded-2xl px-3 py-2.5"
        header={
          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
              <span className="pt-0.5 font-[family-name:var(--font-quicksand)] text-base font-bold tabular-nums text-[#17263D]">
                {item.time}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#17263D]">{item.title}</span>
                <span className="block text-xs text-slate-600">
                  {total} murid{item.location ? ` · ${item.location}` : ""}
                </span>
                <span className="block text-xs text-slate-500">
                  {namesPreview(item.students.map((s) => s.name))}
                </span>
                {showProgress && (
                  <span className="mt-0.5 block text-xs font-medium text-[#7a5c00]">
                    {filled}/{total} laporan diisi
                  </span>
                )}
              </span>
            </span>
            <span
              className={
                pending > 0 ? `${CTA_PRIMARY} pointer-events-none` : `${CTA_SECONDARY} pointer-events-none`
              }
            >
              {pending > 0 ? "Isi Laporan" : "Lihat murid"}
            </span>
          </span>
        }
      >
        <ul className="flex flex-col divide-y divide-white/70 px-3 pb-2 pt-1">
          {item.students.map((s) => (
            <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#17263D]">{s.name}</p>
                {focusLine(s) && <p className="text-xs text-slate-500">{focusLine(s)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                <StudentAction s={s} />
              </div>
            </li>
          ))}
        </ul>
      </AccordionItem>
    </li>
  );
}

function SessionList({ items }: { items: SessionItem[] }) {
  return (
    <ul className="divide-y divide-white/60">
      {items.map((item) =>
        item.isGroup ? <GroupRow key={item.key} item={item} /> : <PrivateRow key={item.key} item={item} />
      )}
    </ul>
  );
}

// Today (or the next session day when today is empty): open, with a clear
// header, a stronger surface and the day's list right below.
export function FocusDay({ day, kicker }: { day: DaySchedule; kicker: string }) {
  return (
    <section className="rounded-3xl border border-[#35C5D0]/45 bg-gradient-to-br from-white/85 to-[#E6F8FA]/80 p-4 shadow-[0_10px_36px_rgba(53,197,208,0.18)] backdrop-blur-xl sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-[#1597A3]">
        {kicker} &middot; {day.dayName}, {day.dateLabel}
      </p>
      <p className="mt-0.5 text-sm text-slate-600">{daySummary(day)}</p>
      <div className="mt-2">
        <SessionList items={day.items} />
      </div>
    </section>
  );
}

// Every other day: a quiet, collapsed group whose header carries the count
// (and a small flag when reports are waiting).
export function DayAccordion({ day, defaultOpen = false }: { day: DaySchedule; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="rounded-2xl border border-white/55 bg-white/40 backdrop-blur-md"
      headerClassName="min-h-14 rounded-2xl px-4 py-2"
      header={
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-600">
              {day.dayName}, {day.dateLabel}
            </span>
            <span className="block text-xs text-slate-500">{daySummary(day)}</span>
          </span>
          {day.pending > 0 && (
            <span className="rounded-full bg-[#FFF3C4] px-2.5 py-0.5 text-xs font-semibold text-[#7a5c00]">
              {day.pending} belum diisi
            </span>
          )}
        </span>
      }
    >
      <div className="px-4 pb-2">
        <SessionList items={day.items} />
      </div>
    </AccordionItem>
  );
}
