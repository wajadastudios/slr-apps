"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Tab = "anak" | "dewasa";

const MEDAL = {
  silver: { bg: "bg-[#F0F2F5]", label: "text-[#5A6475]", text: "text-[#3D4552]" },
  gold: { bg: "bg-[#FFF8E1]", label: "text-[#8A6400]", text: "text-[#5A4200]" },
  bronze: { bg: "bg-[#FDF0E0]", label: "text-[#9B5A1A]", text: "text-[#6B3A0A]" },
};

interface TabData {
  avatar: string;
  name: string;
  guardian: string;
  schedule: string;
  focus: string;
  focusSub: string;
  target: string;
  targetSub: string;
  medal: keyof typeof MEDAL;
  quota: string;
}

interface ReportData {
  title: string;
  program: string;
  schedule: string;
  status: string;
  statusSub: string;
  focusLabel: string;
  focus: string;
  coachNote: string;
  target: string;
  targetSub: string;
  medal: keyof typeof MEDAL;
  quota: string;
}

const ANAK: TabData = {
  avatar: "N",
  name: "Nabil · Kids Swim",
  guardian: "Dipantau oleh Bunda Riani",
  schedule: "Rabu · 09.00 WIB · Coach Sari",
  focus: "Belajar mengambil napas ke samping",
  focusSub: "Catatan coach: latihan pernapasan bilateral",
  target: "Meluncur 8 meter",
  targetSub: "2 target lagi menuju lencana Perak",
  medal: "silver",
  quota: "Sisa 4 dari 8 sesi",
};

const DEWASA: TabData = {
  avatar: "N",
  name: "Nabila · Teen & Adult Swim",
  guardian: "Perkembangan Saya",
  schedule: "Sabtu · 15.00 WIB · Coach Sari",
  focus: "Latihan pernapasan bilateral",
  focusSub: "Catatan coach: perbaiki ritme napas kiri",
  target: "Meluncur 25 meter",
  targetSub: "1 target lagi menuju lencana Perak",
  medal: "silver",
  quota: "Sisa 4 dari 8 sesi",
};

const REPORT_ANAK: ReportData = {
  title: "Laporan Latihan Nabil",
  program: "Kids Swim",
  schedule: "Rabu · 09.00 WIB · Coach Sari",
  status: "Hadir",
  statusSub: "Sesi selesai",
  focusLabel: "Fokus sesi hari ini",
  focus: "Mengambil napas ke samping",
  coachNote:
    "Nabil mulai lebih nyaman memutar kepala saat bernapas. Latihan berikutnya akan melanjutkan ritme napas sambil menjaga posisi tubuh tetap stabil.",
  target: "Meluncur 8 meter",
  targetSub: "2 target lagi menuju lencana Perak",
  medal: "silver",
  quota: "Paket aktif · Sisa 4 dari 8 sesi",
};

const REPORT_DEWASA: ReportData = {
  title: "Laporan Latihan Nabila",
  program: "Teen & Adult Swim",
  schedule: "Sabtu · 15.00 WIB · Coach Sari",
  status: "Hadir",
  statusSub: "Sesi selesai",
  focusLabel: "Fokus sesi hari ini",
  focus: "Latihan pernapasan bilateral",
  coachNote:
    "Nabila semakin stabil saat mengambil napas ke sisi kiri. Sesi berikutnya akan berfokus pada menjaga ritme napas saat jarak renang bertambah.",
  target: "Meluncur 25 meter",
  targetSub: "1 target lagi menuju lencana Perak",
  medal: "silver",
  quota: "Paket aktif · Sisa 4 dari 8 sesi",
};

function ReportModal({ report, onClose }: { report: ReportData; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const m = MEDAL[report.medal];

  // Focus the close button when modal opens
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Focus trap + Escape key
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = panel!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#17263D]/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="report-modal-title"
    >
      <div
        ref={panelRef}
        style={{ animation: "modal-in 240ms ease-out both" }}
        className="w-full max-h-[88vh] overflow-y-auto rounded-t-3xl border border-white/60 bg-white/95 shadow-[0_-8px_40px_rgba(23,38,61,0.25)] backdrop-blur-xl sm:w-[min(92vw,26rem)] sm:max-h-[85vh] sm:rounded-3xl sm:shadow-[0_24px_64px_rgba(23,38,61,0.35)]"
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl border-b border-white/40 bg-white/95 p-5 backdrop-blur-xl">
          <div className="min-w-0">
            <span className="mb-1.5 inline-block rounded-full border border-[#35C5D0]/40 bg-[#EEF9FB] px-2 py-0.5 text-[10px] font-semibold text-[#0B6470]">
              Contoh laporan
            </span>
            <h2
              id="report-modal-title"
              className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]"
            >
              {report.title}
            </h2>
            <p className="text-xs text-slate-500">{report.program}</p>
            <p className="text-xs text-slate-500">{report.schedule}</p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Tutup contoh laporan"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-700 active:bg-slate-100"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-5">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DDF7EC] text-sm font-bold text-[#0E5A43]" aria-hidden="true">
              ✓
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0E5A43]">{report.status}</p>
              <p className="text-xs text-slate-500">{report.statusSub}</p>
            </div>
          </div>

          {/* Fokus latihan */}
          <div className="rounded-2xl bg-[#EEF9FB] p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#0B6470]">
              {report.focusLabel}
            </p>
            <p className="text-sm font-semibold text-[#17263D]">{report.focus}</p>
          </div>

          {/* Catatan coach */}
          <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Catatan coach
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{report.coachNote}</p>
          </div>

          {/* Target berikutnya */}
          <div className={`rounded-2xl p-4 ${m.bg}`}>
            <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${m.label}`}>
              Target Berikutnya
            </p>
            <div className="flex items-center gap-2.5">
              <span className="text-xl" aria-hidden="true">🏅</span>
              <div>
                <p className={`text-sm font-semibold ${m.text}`}>{report.target}</p>
                <p className="text-xs text-slate-500">{report.targetSub}</p>
              </div>
            </div>
          </div>

          {/* Kuota */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#35C5D0]" aria-hidden="true" />
            {report.quota}
          </div>

          {/* Link ke section fitur */}
          <div className="border-t border-slate-100 pt-2 text-center">
            <a
              href="#laporan-latihan"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-[#35C5D0] hover:underline active:text-[#0E7C89]"
            >
              Pelajari manfaat laporan digital ↓
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppPreviewCard() {
  const [tab, setTab] = useState<Tab>("anak");
  const [showReport, setShowReport] = useState(false);
  const d = tab === "anak" ? ANAK : DEWASA;
  const m = MEDAL[d.medal];
  const report = tab === "anak" ? REPORT_ANAK : REPORT_DEWASA;

  const openReport = useCallback(() => setShowReport(true), []);
  const closeReport = useCallback(() => setShowReport(false), []);

  return (
    <>
      <div className="rounded-2xl border border-white/50 bg-white/60 p-4 shadow-[0_16px_40px_rgba(23,38,61,0.2)] backdrop-blur-xl">
        {/* Badge + tab switcher */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
            Contoh tampilan aplikasi
          </span>
          <div role="tablist" aria-label="Pilih persona" className="flex rounded-xl border border-white/60 bg-white/40 p-0.5">
            {([["anak", "Untuk Anak"], ["dewasa", "Untuk Dewasa"]] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all duration-200 ${
                  tab === t
                    ? "bg-[#35C5D0] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content — key triggers remount + enter animation on tab change */}
        <div
          key={tab}
          style={{ animation: "tab-in 220ms ease-out both" }}
          className="flex flex-col gap-2"
        >
          {/* Participant header */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#35C5D0]/15 text-sm font-bold text-[#35C5D0]">
              {d.avatar}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#17263D]">{d.name}</p>
              <p className="text-[10px] text-slate-500">{d.guardian}</p>
            </div>
          </div>

          {/* Block 1: Next session */}
          <div className="flex items-start gap-2 rounded-xl bg-[#FFF8E1] px-2.5 py-2">
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">📅</span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8A6400]">Sesi Berikutnya</p>
              <p className="text-[11px] font-medium text-[#17263D]">{d.schedule}</p>
            </div>
          </div>

          {/* Block 2: Training focus */}
          <div className="flex items-start gap-2 rounded-xl bg-[#EEF9FB] px-2.5 py-2">
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">🌊</span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0B6470]">Fokus Latihan</p>
              <p className="text-[11px] font-medium text-[#17263D]">{d.focus}</p>
              <p className="text-[10px] text-slate-500">{d.focusSub}</p>
            </div>
          </div>

          {/* Block 3: Next target */}
          <div className={`flex items-start gap-2 rounded-xl px-2.5 py-2 ${m.bg}`}>
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">🏅</span>
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${m.label}`}>Target Berikutnya</p>
              <p className={`text-[11px] font-medium ${m.text}`}>{d.target}</p>
              <p className="text-[10px] text-slate-500">{d.targetSub}</p>
            </div>
          </div>

          {/* Footer: quota + CTA */}
          <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/60 pt-2">
            <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#35C5D0]" aria-hidden="true" />
              Paket aktif &middot; {d.quota}
            </span>
            <button
              onClick={openReport}
              className="text-[10px] font-semibold text-[#35C5D0] hover:underline active:text-[#0E7C89]"
            >
              Buka contoh laporan &rarr;
            </button>
          </div>
        </div>
      </div>

      {showReport && <ReportModal report={report} onClose={closeReport} />}
    </>
  );
}
