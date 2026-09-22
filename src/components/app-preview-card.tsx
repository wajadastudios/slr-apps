"use client";

import { useState } from "react";
import { smoothScrollToId } from "@/lib/smooth-scroll";
import { APP_CARD_WIDTH_CLASS } from "@/lib/card-sizing";
import { FocusTargetIcon } from "@/components/icons/focus-target-icon";

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

export function AppPreviewCard() {
  const [tab, setTab] = useState<Tab>("anak");
  const d = tab === "anak" ? ANAK : DEWASA;
  const m = MEDAL[d.medal];

  return (
    <div className={`${APP_CARD_WIDTH_CLASS} rounded-2xl border border-white/50 bg-white/60 p-4 shadow-[0_16px_40px_rgba(23,38,61,0.2)] backdrop-blur-xl`}>
      {/* Tab switcher */}
      <div className="mb-3 flex items-center justify-end gap-2">
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

      {/* Content */}
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
          <FocusTargetIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#35C5D0]" />
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
          <a
            href="#contoh-aplikasi"
            onClick={(e) => {
              e.preventDefault();
              smoothScrollToId("contoh-aplikasi");
            }}
            className="text-[10px] font-semibold text-[#35C5D0] hover:underline active:text-[#0E7C89]"
          >
            Buka contoh laporan &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
