"use client";

import { useEffect, useRef, useState, useId, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

type Persona = "anak" | "dewasa";

// --- Types ---
interface RingkasanData {
  name: string; program: string; date: string; coach: string;
  focus: string; coachNote: string; quota: string;
}
interface Indicator { label: string; status: "done" | "active" | "upcoming"; }
interface IndicatorGroup { name: string; indicators: Indicator[]; }
interface LaporanData { groups: IndicatorGroup[]; }
interface TrendPoint { session: string; value: number; label: string; }
interface PerkembanganData { metric: string; unit: string; points: TrendPoint[]; }
interface AchievedRecord { medal: MedalKey; title: string; date: string; }
interface FutureTarget { medal: MedalKey; title: string; }
interface RekorData { achieved: AchievedRecord[]; futureTargets: FutureTarget[]; }
type MedalKey = "bronze" | "silver" | "gold";

// --- Medal tokens ---
const MEDAL = {
  bronze: { hex: "#CD7F32", bg: "bg-[#FDF0E0]", text: "text-[#6B3A0A]", label: "text-[#9B5A1A]", emoji: "🥉" },
  silver: { hex: "#A8A9AD", bg: "bg-[#F0F2F5]", text: "text-[#3D4552]", label: "text-[#5A6475]", emoji: "🥈" },
  gold:   { hex: "#FFD700", bg: "bg-[#FFF8E1]", text: "text-[#5A4200]", label: "text-[#8A6400]", emoji: "🥇" },
};

// --- Data ---
const RINGKASAN_DATA: Record<Persona, RingkasanData> = {
  anak: {
    name: "Nabil", program: "Kids Swim",
    date: "Rabu, 11 Sep 2024", coach: "Coach Sari",
    focus: "Mengambil napas ke samping",
    coachNote: "Nabil mulai lebih nyaman memutar kepala saat bernapas. Latihan berikutnya melanjutkan ritme napas sambil menjaga posisi tubuh tetap stabil.",
    quota: "Paket aktif · Sisa 4 dari 8 sesi",
  },
  dewasa: {
    name: "Nabila", program: "Teen & Adult Swim",
    date: "Sabtu, 14 Sep 2024", coach: "Coach Sari",
    focus: "Latihan pernapasan bilateral",
    coachNote: "Nabila semakin stabil saat mengambil napas ke sisi kiri. Sesi berikutnya berfokus pada menjaga ritme napas saat jarak renang bertambah.",
    quota: "Paket aktif · Sisa 4 dari 8 sesi",
  },
};

const LAPORAN_DATA: Record<Persona, LaporanData> = {
  anak: {
    groups: [
      { name: "Dasar", indicators: [
        { label: "Masuk air tanpa takut", status: "done" },
        { label: "Menahan napas dalam air", status: "done" },
        { label: "Meluncur dengan papan", status: "done" },
        { label: "Meluncur tanpa papan", status: "done" },
        { label: "Mengambil napas ke samping", status: "active" },
        { label: "Koordinasi lengan & kaki", status: "upcoming" },
      ]},
      { name: "Menengah", indicators: [
        { label: "Gaya crawl 10 meter", status: "upcoming" },
        { label: "Gaya punggung dasar", status: "upcoming" },
        { label: "Pernapasan ritmis", status: "upcoming" },
        { label: "Push off dinding", status: "upcoming" },
        { label: "Gaya bebas 25 meter", status: "upcoming" },
        { label: "Koordinasi bilateral", status: "upcoming" },
      ]},
      { name: "Mahir", indicators: [
        { label: "Gaya dada teknik dasar", status: "upcoming" },
        { label: "Gaya kupu-kupu dasar", status: "upcoming" },
        { label: "Start dari balok", status: "upcoming" },
        { label: "Pembalikan flip turn", status: "upcoming" },
        { label: "Gaya bebas 50 meter", status: "upcoming" },
        { label: "Medley pendek", status: "upcoming" },
      ]},
    ],
  },
  dewasa: {
    groups: [
      { name: "Teknik Dasar", indicators: [
        { label: "Posisi badan horizontal", status: "done" },
        { label: "Koordinasi lengan crawl", status: "done" },
        { label: "Latihan pernapasan bilateral", status: "active" },
        { label: "Kick dan pull timing", status: "upcoming" },
        { label: "Wall turn", status: "upcoming" },
        { label: "Renang 25 meter tanpa henti", status: "upcoming" },
      ]},
      { name: "Teknik Menengah", indicators: [
        { label: "Efisiensi stroke", status: "upcoming" },
        { label: "Bilateral breathing stabil", status: "upcoming" },
        { label: "Renang 50 meter", status: "upcoming" },
        { label: "Open turn", status: "upcoming" },
        { label: "Drills teknik lanjutan", status: "upcoming" },
        { label: "Renang 100 meter", status: "upcoming" },
      ]},
      { name: "Teknik Lanjutan", indicators: [
        { label: "Flip turn", status: "upcoming" },
        { label: "Gaya punggung", status: "upcoming" },
        { label: "Interval training", status: "upcoming" },
        { label: "Renang 200 meter", status: "upcoming" },
        { label: "Pace control", status: "upcoming" },
        { label: "Triathlon prep", status: "upcoming" },
      ]},
    ],
  },
};

const PERKEMBANGAN_DATA: Record<Persona, PerkembanganData> = {
  anak: {
    metric: "Jarak meluncur", unit: "meter",
    points: [
      { session: "21 Agu", value: 2, label: "2 meter" },
      { session: "28 Agu", value: 3, label: "3 meter" },
      { session: "4 Sep", value: 3, label: "3 meter" },
      { session: "11 Sep", value: 5, label: "5 meter" },
      { session: "18 Sep", value: 6, label: "6 meter" },
      { session: "25 Sep", value: 8, label: "8 meter" },
    ],
  },
  dewasa: {
    metric: "Jarak renang", unit: "meter",
    points: [
      { session: "21 Agu", value: 10, label: "10 meter" },
      { session: "28 Agu", value: 12, label: "12 meter" },
      { session: "4 Sep", value: 15, label: "15 meter" },
      { session: "11 Sep", value: 18, label: "18 meter" },
      { session: "18 Sep", value: 20, label: "20 meter" },
      { session: "25 Sep", value: 25, label: "25 meter" },
    ],
  },
};

const REKOR_DATA: Record<Persona, RekorData> = {
  anak: {
    achieved: [
      { medal: "bronze", title: "Mengapung terlentang mandiri", date: "21 Agu 2024" },
      { medal: "silver", title: "Tahan napas terkontrol", date: "4 Sep 2024" },
      { medal: "bronze", title: "Meluncur 5 meter", date: "11 Sep 2024" },
    ],
    futureTargets: [
      { medal: "silver", title: "Meluncur 8 meter" },
      { medal: "gold", title: "Renang crawl 15 meter" },
      { medal: "gold", title: "Gaya crawl teknik lengkap" },
    ],
  },
  dewasa: {
    achieved: [
      { medal: "bronze", title: "Renang 10 meter pertama", date: "21 Agu 2024" },
      { medal: "silver", title: "Renang 15 meter tanpa henti", date: "4 Sep 2024" },
      { medal: "gold", title: "Renang 25 meter crawl", date: "25 Sep 2024" },
    ],
    futureTargets: [
      { medal: "gold", title: "Renang 50 meter" },
      { medal: "gold", title: "Bilateral breathing konsisten" },
      { medal: "gold", title: "Flip turn teknik baik" },
    ],
  },
};

const CARD_DEFS: { key: string; title: string; icon: string }[] = [
  { key: "ringkasan",    title: "Ringkasan",          icon: "📋" },
  { key: "laporan",      title: "Laporan Terbaru",    icon: "📝" },
  { key: "perkembangan", title: "Perkembangan",       icon: "📈" },
  { key: "rekor",        title: "Rekor & Pencapaian", icon: "🏅" },
];

// --- Sub-components (card body content, reused by desktop deck + mobile) ---

function CardRingkasan({ data }: { data: RingkasanData }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#35C5D0]/15 text-sm font-bold text-[#35C5D0]">
          {data.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#17263D]">{data.name}</p>
          <p className="text-[10px] text-slate-500">{data.program}</p>
        </div>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-[#DDF7EC] px-2 py-0.5 text-[10px] font-semibold text-[#0E5A43]">
          <span aria-hidden="true">✓</span> Hadir
        </span>
      </div>
      <div className="rounded-xl bg-[#FFF8E1] px-2.5 py-2">
        <p className="text-[10px] font-semibold text-[#8A6400]">{data.date} · {data.coach}</p>
      </div>
      <div className="rounded-xl bg-[#EEF9FB] px-2.5 py-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0B6470]">Fokus sesi hari ini</p>
        <p className="text-sm font-medium text-[#17263D]">{data.focus}</p>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white/60 px-2.5 py-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Catatan coach</p>
        <p className="text-xs leading-relaxed text-slate-700">{data.coachNote}</p>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#35C5D0]" aria-hidden="true" />
        {data.quota}
      </div>
    </div>
  );
}

function CardLaporan({ data }: { data: LaporanData }) {
  const [openGroup, setOpenGroup] = useState<string>(data.groups[0].name);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Indikator perkembangan</p>
      {data.groups.map((group) => {
        const isOpen = openGroup === group.name;
        const done = group.indicators.filter((i) => i.status === "done").length;
        return (
          <div key={group.name} className="overflow-hidden rounded-xl border border-white/60 bg-white/40">
            <button
              onClick={() => setOpenGroup(isOpen ? "" : group.name)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#17263D]">{group.name}</span>
                <span className="rounded-full bg-[#EEF9FB] px-1.5 py-0.5 text-[10px] font-medium text-[#0B6470]">
                  {done}/{group.indicators.length}
                </span>
              </div>
              <svg viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <ul className="border-t border-white/40 px-3 pb-2 pt-1.5">
                {group.indicators.map((ind) => (
                  <li key={ind.label} className="flex items-center gap-2 py-1">
                    {ind.status === "done" ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#DDF7EC] text-[10px] font-bold text-[#0E5A43]" aria-hidden="true">✓</span>
                    ) : ind.status === "active" ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EEF9FB]" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-[#35C5D0]" />
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-slate-300" />
                      </span>
                    )}
                    <span className={`text-xs ${ind.status === "done" ? "text-slate-700" : ind.status === "active" ? "font-medium text-[#0B6470]" : "text-slate-400"}`}>
                      {ind.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ data }: { data: PerkembanganData }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradId = useId();

  const W = 260, H = 80, PL = 8, PR = 8, PT = 12, PB = 22;
  const vals = data.points.map((p) => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const toX = (i: number) => PL + (i / (vals.length - 1)) * (W - PL - PR);
  const toY = (v: number) => PT + (1 - (v - minV) / range) * (H - PT - PB);

  const pts = vals.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const area = `${PL},${H - PB} ${pts} ${W - PR},${H - PB}`;

  function pickNearest(clientX: number, rect: DOMRect): number {
    const rawX = ((clientX - rect.left) / rect.width) * W;
    let near = 0, best = Infinity;
    for (let i = 0; i < vals.length; i++) {
      const d = Math.abs(toX(i) - rawX);
      if (d < best) { best = d; near = i; }
    }
    return near;
  }

  const tipPct = hovered !== null
    ? Math.max(8, Math.min(92, (toX(hovered) / W) * 100))
    : 0;

  return (
    <div className="relative" role="img" aria-label={`Grafik ${data.metric} 6 sesi terakhir`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-hidden="true"
        onMouseMove={(e) => setHovered(pickNearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHovered(null)}
        onTouchStart={(e) => {
          e.preventDefault();
          setHovered(pickNearest(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()));
        }}
        onTouchEnd={() => setTimeout(() => setHovered(null), 2500)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#35C5D0" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#35C5D0" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[PT, PT + (H - PT - PB) / 2, H - PB].map((y, k) => (
          <line key={k} x1={PL} y1={y} x2={W - PR} y2={y} stroke="#E2E8F0" strokeWidth="0.5" />
        ))}
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline points={pts} fill="none" stroke="#35C5D0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {hovered !== null && (
          <>
            <line x1={toX(hovered)} y1={PT} x2={toX(hovered)} y2={H - PB} stroke="#35C5D0" strokeWidth="0.75" strokeDasharray="3,2" />
            <circle cx={toX(hovered)} cy={toY(vals[hovered])} r="3.5" fill="white" stroke="#35C5D0" strokeWidth="1.5" />
          </>
        )}
        {data.points.map((p, i) => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fill="#94A3B8" fontSize="7">
            {p.session}
          </text>
        ))}
      </svg>
      {hovered !== null && (
        <div
          className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-lg border border-white/60 bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-[#17263D] shadow-sm backdrop-blur-sm"
          style={{ left: `${tipPct}%`, transform: "translateX(-50%)" }}
          role="tooltip"
        >
          <span className="text-[#35C5D0]">{data.points[hovered].session}</span>
          {" · "}
          {data.points[hovered].label}
        </div>
      )}
    </div>
  );
}

function CardPerkembangan({ data }: { data: PerkembanganData }) {
  const vals = data.points.map((p) => p.value);
  const delta = vals[vals.length - 1] - vals[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{data.metric}</p>
          <p className="mt-0.5 text-2xl font-bold text-[#17263D]">
            {vals[vals.length - 1]} <span className="text-sm font-normal text-slate-500">{data.unit}</span>
          </p>
        </div>
        <span className="rounded-full bg-[#DDF7EC] px-2 py-0.5 text-[10px] font-semibold text-[#0E5A43]">
          +{delta} {data.unit} dari awal
        </span>
      </div>
      <div className="rounded-xl bg-white/40 p-2 pt-8">
        <TrendChart data={data} />
      </div>
      <p className="text-center text-[10px] text-slate-400">6 sesi terakhir · arahkan kursor ke grafik untuk detail</p>
    </div>
  );
}

function CardRekor({ data }: { data: RekorData }) {
  const [showFuture, setShowFuture] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pencapaian diraih</p>
      <div className="flex flex-col gap-2">
        {data.achieved.map((rec, i) => {
          const m = MEDAL[rec.medal];
          return (
            <div key={i} className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 ${m.bg}`}>
              <span className="shrink-0 text-lg leading-none" aria-hidden="true">{m.emoji}</span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${m.text}`}>{rec.title}</p>
                <p className="text-[10px] text-slate-500">{rec.date}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-xl border border-white/60 bg-white/40">
        <button
          onClick={() => setShowFuture(!showFuture)}
          aria-expanded={showFuture}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-xs font-semibold text-slate-700">Target berikutnya</span>
          <svg viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${showFuture ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {showFuture && (
          <ul className="flex flex-col gap-1.5 border-t border-white/40 px-3 pb-2.5 pt-2">
            {data.futureTargets.map((t, i) => {
              const m = MEDAL[t.medal];
              return (
                <li key={i} className="flex items-center gap-2">
                  <span className="shrink-0 text-base leading-none" aria-hidden="true">{m.emoji}</span>
                  <span className={`text-xs ${m.text}`}>{t.title}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function renderCardBody(index: number, persona: Persona) {
  switch (index) {
    case 0: return <CardRingkasan data={RINGKASAN_DATA[persona]} />;
    case 1: return <CardLaporan key={persona} data={LAPORAN_DATA[persona]} />;
    case 2: return <CardPerkembangan key={persona} data={PERKEMBANGAN_DATA[persona]} />;
    default: return <CardRekor key={persona} data={REKOR_DATA[persona]} />;
  }
}

/**
 * App-page-like frame: faux notch + icon/title header, scrollable body.
 * `flow`: mobile mode — height grows with content instead of filling a fixed
 * box, so long reports/records are never clipped.
 */
function CardFrame({
  icon, title, active, flow, children,
}: { icon: string; title: string; active?: boolean; flow?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex ${flow ? "h-auto min-h-[420px]" : "h-full"} flex-col overflow-hidden rounded-[26px] border bg-white/95 backdrop-blur-2xl transition-shadow duration-300 ${
        active
          ? "border-white/70 shadow-[0_35px_70px_-15px_rgba(4,15,28,0.65)]"
          : "border-white/40 shadow-[0_20px_40px_-15px_rgba(4,15,28,0.45)]"
      }`}
    >
      <div className="flex items-center justify-center pt-2.5" aria-hidden="true">
        <div className="h-1 w-9 rounded-full bg-slate-300/70" />
      </div>
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-2 sm:px-5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#35C5D0]/15 text-sm" aria-hidden="true">
          {icon}
        </span>
        <p className="font-[family-name:var(--font-quicksand)] text-sm font-bold text-[#17263D]">{title}</p>
      </div>
      <div className={`min-h-0 flex-1 ${flow ? "overflow-visible" : "overflow-y-auto"} border-t border-slate-100 px-4 py-3 sm:px-5`}>
        {children}
      </div>
    </div>
  );
}

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Positions each deck card relative to the active one: center / side / teaser / hidden. */
function deckStyle(offset: number): CSSProperties {
  const abs = Math.abs(offset);
  if (abs > 2) {
    return {
      transform: `translateX(-50%) translateX(${offset > 0 ? 130 : -130}%) scale(0.6)`,
      opacity: 0,
      zIndex: 0,
      pointerEvents: "none",
    };
  }
  const sign = Math.sign(offset);
  const translateX = abs === 0 ? 0 : abs === 1 ? 60 : 96;
  const translateY = abs === 0 ? 0 : abs === 1 ? 20 : 36;
  const scale = abs === 0 ? 1 : abs === 1 ? 0.86 : 0.74;
  const rotate = abs === 0 ? 0 : sign * (abs === 1 ? 6 : 3);
  const opacity = abs === 0 ? 1 : abs === 1 ? 0.7 : 0.32;
  const zIndex = 30 - abs * 10;
  return {
    transform: `translateX(-50%) translateX(${translateX * sign}%) translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
    opacity,
    zIndex,
    pointerEvents: abs === 0 ? "auto" : "none",
  };
}

// --- Main gallery ---

export function AppGallery() {
  const [persona, setPersona] = useState<Persona>("anak");
  const [activeCard, setActiveCard] = useState(0);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const mobileCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reducedMotion = usePrefersReducedMotion();

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(CARD_DEFS.length - 1, index));
    setActiveCard(clamped);
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      mobileCardRefs.current[clamped]?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        inline: "start",
        block: "nearest",
      });
    }
  }

  // Sync activeCard when the user swipes the mobile track manually.
  useEffect(() => {
    const container = mobileScrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (mostVisible) {
          const idx = Number((mostVisible.target as HTMLElement).dataset.index);
          if (!Number.isNaN(idx)) setActiveCard(idx);
        }
      },
      { root: container, threshold: [0.55] },
    );
    mobileCardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [persona]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(activeCard - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(activeCard + 1); }
  }

  const current = CARD_DEFS[activeCard];

  return (
    <div className="relative mx-4 sm:mx-6 lg:mx-auto lg:max-w-6xl">
      {/* Dark stage background, clipped separately so cards can bleed past the frame edge */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-[2rem] sm:rounded-[2.5rem]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 55% at 50% -8%, rgba(53,197,208,0.38), transparent 60%), linear-gradient(180deg, #0A2233 0%, #0D3A48 32%, #12586A 62%, #1C8DA0 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 22%, rgba(255,255,255,0.06), transparent 38%), radial-gradient(circle at 82% 12%, rgba(255,255,255,0.07), transparent 34%), radial-gradient(circle at 65% 82%, rgba(255,255,255,0.05), transparent 42%), radial-gradient(circle at 12% 78%, rgba(255,255,255,0.04), transparent 40%)",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#35C5D0] opacity-20 blur-[70px] sm:h-[420px] sm:w-[420px] sm:opacity-30 sm:blur-[110px]"
          aria-hidden="true"
        />
      </div>

      <div className="relative z-10 flex w-full flex-col gap-6 px-5 py-12 sm:gap-7 sm:px-8 sm:py-16">
        {/* Heading */}
        <div className="mx-auto max-w-xl text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
            Contoh Tampilan Aplikasi
          </span>
          <h2 className="mt-2 font-[family-name:var(--font-quicksand)] text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
            Pantau perjalanan latihan, satu langkah demi satu langkah.
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-sm text-white/70 sm:text-base">
            Laporan sesi, arah latihan, dan pencapaian rekor tersimpan dalam satu tempat.
          </p>
        </div>

        {/* Persona switch */}
        <div className="flex justify-center">
          <div role="tablist" aria-label="Pilih persona" className="flex rounded-full border border-white/15 bg-[#081E2A]/55 p-1 shadow-[0_8px_24px_rgba(2,10,18,0.35)] backdrop-blur-xl">
            {(["anak", "dewasa"] as Persona[]).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={persona === p}
                onClick={() => setPersona(p)}
                className={`flex min-h-[44px] items-center justify-center rounded-full px-5 text-sm font-semibold transition-all duration-200 ${
                  persona === p ? "bg-white text-[#0E7C89] shadow-sm" : "text-white/70 hover:text-white"
                }`}
              >
                {p === "anak" ? "Untuk Anak" : "Untuk Dewasa"}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop card-deck stage */}
        <div
          className="relative hidden h-[420px] sm:block"
          onKeyDown={handleKeyDown}
          role="region"
          aria-label="Contoh tampilan aplikasi"
        >
          {CARD_DEFS.map((def, i) => {
            const offset = i - activeCard;
            const isActive = offset === 0;
            return (
              <div
                key={def.key}
                className="absolute left-1/2 top-0 h-[420px] w-[290px] transition-[transform,opacity] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:w-[320px] md:w-[350px]"
                style={deckStyle(offset)}
                aria-hidden={!isActive}
                inert={!isActive ? true : undefined}
              >
                <CardFrame icon={def.icon} title={def.title} active={isActive}>
                  {renderCardBody(i, persona)}
                </CardFrame>
              </div>
            );
          })}
        </div>

        {/* Mobile: single-card focus stage, only one teaser card peeking on the right */}
        <div className="sm:hidden" role="region" aria-label="Contoh tampilan aplikasi">
          <div
            ref={mobileScrollRef}
            className="relative left-1/2 right-1/2 -mx-[50vw] flex w-screen items-start snap-x snap-mandatory gap-2 overflow-x-auto py-3 pl-4 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {CARD_DEFS.map((def, i) => {
              const offset = i - activeCard;
              const isActive = offset === 0;
              const isTeaser = offset === 1;
              return (
                <div
                  key={def.key}
                  ref={(el) => { mobileCardRefs.current[i] = el; }}
                  data-index={i}
                  className="w-[89vw] max-w-[420px] shrink-0 snap-start transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={
                    isActive
                      ? undefined
                      : isTeaser
                        ? { transform: "translateY(16px) scale(0.96)", opacity: 0.25 }
                        : { opacity: 0 }
                  }
                  aria-hidden={!isActive}
                  inert={!isActive ? true : undefined}
                >
                  <CardFrame icon={def.icon} title={def.title} active={isActive} flow>
                    {renderCardBody(i, persona)}
                  </CardFrame>
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating glass pill controls */}
        <div className="flex justify-center">
          <div className="flex items-center gap-3 rounded-full border border-white/15 bg-[#081E2A]/55 px-2.5 py-2 shadow-[0_8px_24px_rgba(2,10,18,0.35)] backdrop-blur-xl sm:gap-4 sm:px-3">
            <button
              onClick={() => goTo(activeCard - 1)}
              disabled={activeCard === 0}
              aria-label="Kartu sebelumnya"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg text-white transition hover:bg-white/25 disabled:pointer-events-none disabled:opacity-30"
            >
              ‹
            </button>
            <span className="min-w-[130px] text-center text-sm font-semibold text-white sm:min-w-[160px]">
              <span aria-hidden="true">{current.icon}</span> {current.title} · {activeCard + 1}/{CARD_DEFS.length}
            </span>
            <button
              onClick={() => goTo(activeCard + 1)}
              disabled={activeCard === CARD_DEFS.length - 1}
              aria-label="Kartu berikutnya"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg text-white transition hover:bg-white/25 disabled:pointer-events-none disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
