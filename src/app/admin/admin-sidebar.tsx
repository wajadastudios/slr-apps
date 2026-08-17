"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

const NAV_GROUPS: { label: string | null; items: { href: string; label: string }[] }[] = [
  { label: null, items: [{ href: "/admin", label: "Ringkasan" }] },
  {
    label: "Orang",
    items: [
      { href: "/admin/murid", label: "Siswa" },
      { href: "/admin/pelatih", label: "Pengajar" },
      { href: "/admin/orang-tua", label: "Orang Tua" },
      { href: "/admin/pendaftar", label: "Pendaftar" },
    ],
  },
  {
    label: "Program",
    items: [
      { href: "/admin/program", label: "Program" },
      { href: "/admin/slot-jadwal", label: "Slot Jadwal" },
      { href: "/admin/jadwal", label: "Jadwal Siswa" },
      { href: "/admin/paket-harga", label: "Paket Harga" },
    ],
  },
  { label: "Keuangan", items: [{ href: "/admin/tagihan", label: "Tagihan" }] },
  {
    label: "Konten",
    items: [
      { href: "/admin/testimoni", label: "Testimoni" },
      { href: "/admin/galeri", label: "Galeri" },
      { href: "/admin/pengaturan", label: "Pengaturan" },
    ],
  },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
      {NAV_GROUPS.map((group, i) => (
        <div key={i} className="flex flex-col gap-1">
          {group.label && (
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#35C5D0] text-white"
                    : "text-slate-700 hover:bg-white/60"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({
  userLabel,
}: {
  userLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/30 bg-white/50 px-4 py-3 shadow-[0_8px_32px_rgba(23,38,61,0.1)] backdrop-blur-xl lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={24} height={24} />
          <span className="font-[family-name:var(--font-quicksand)] text-sm font-bold text-[#17263D]">
            Sari Les Renang
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-white/40 bg-white/40 px-3 py-1.5 text-sm font-medium text-[#17263D]"
        >
          {open ? "Tutup" : "Menu"}
        </button>
      </div>

      {open && (
        <div className="rounded-2xl border border-white/30 bg-white/50 p-3 shadow-[0_8px_32px_rgba(23,38,61,0.1)] backdrop-blur-xl lg:hidden">
          <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/30 pt-3">
            <span className="truncate text-xs text-slate-600">{userLabel}</span>
            <LogoutButton />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col gap-4 rounded-3xl border border-white/30 bg-white/50 p-4 shadow-[0_8px_32px_rgba(23,38,61,0.1)] backdrop-blur-xl lg:flex">
        <Link href="/admin" className="flex items-center gap-2 px-1">
          <Image src="/logo.png" alt="Sari Les Renang" width={28} height={28} />
          <span className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">
            Sari Les Renang
          </span>
        </Link>
        <NavLinks pathname={pathname} />
        <div className="flex flex-col gap-2 border-t border-white/30 pt-3">
          <span className="truncate text-xs text-slate-600">{userLabel}</span>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
