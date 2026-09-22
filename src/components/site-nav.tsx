"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GlassButton } from "@/components/ui/glass-button";

const NAV = [
  { href: "#kelas", label: "Program" },
  { href: "#tentang", label: "Tentang Kami" },
  { href: "#testimoni", label: "Testimoni" },
  { href: "#faq", label: "FAQ" },
  { href: "#kontak", label: "Kontak" },
];

const HEADING_FONT = "font-[family-name:var(--font-quicksand)]";
const LINK_CLASS =
  "whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/50 active:bg-white/60";
const MOBILE_LINK_CLASS =
  "rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/50 active:bg-white/60";

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <div id="site-nav" className="sticky top-4 z-40 mx-auto w-full max-w-6xl px-4">
      <nav className="rounded-2xl border border-white/50 bg-white/60 shadow-[0_8px_32px_rgba(31,38,135,0.12)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 px-4 py-1">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 pl-1">
            <Image src="/logo.png" alt="Sari Les Renang" width={48} height={48} />
            <span className={`${HEADING_FONT} hidden whitespace-nowrap text-sm font-bold text-[#17263D] min-[400px]:inline`}>
              Sari Les Renang
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden shrink-0 flex-nowrap items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className={LINK_CLASS}>
                {item.label}
              </a>
            ))}
            <span className="mx-2 h-5 w-px shrink-0 bg-slate-300/70" />
            <Link href="/login" className={LINK_CLASS}>
              Masuk
            </Link>
            <Link href="/daftar">
              <GlassButton className="!border-[#35C5D0]/60 !bg-[#35C5D0] whitespace-nowrap px-4 py-1.5 text-sm font-semibold !text-white hover:!bg-[#2bb0ba] active:!bg-[#2bb0ba]">
                Daftar Kelas Trial
              </GlassButton>
            </Link>
          </div>

          {/* Mobile: primary CTA stays in the bar, never buried in the menu */}
          <div className="ml-auto flex items-center gap-1.5 sm:hidden">
            <Link href="/daftar" onClick={() => setOpen(false)}>
              <GlassButton className="!border-[#35C5D0]/60 !bg-[#35C5D0] whitespace-nowrap px-3 py-2 text-xs font-semibold !text-white shadow-[0_4px_14px_rgba(53,197,208,0.45)] hover:!bg-[#2bb0ba] active:!bg-[#2bb0ba]">
                Daftar Kelas Trial
              </GlassButton>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#17263D] transition-colors hover:bg-white/50 active:bg-white/60 sm:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {/* Mobile dropdown — all links stacked, no horizontal scroll */}
        {open && (
          <div className="flex flex-col gap-1 border-t border-white/30 px-4 py-3 sm:hidden">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={MOBILE_LINK_CLASS}
              >
                {item.label}
              </a>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className={MOBILE_LINK_CLASS}>
              Masuk
            </Link>
          </div>
        )}
      </nav>
    </div>
  );
}
