"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

type NavGroup = {
  label: string | null;
  items: { href: string; label: string }[];
};

function NavLinks({
  navGroups,
  pathname,
  onNavigate,
}: {
  navGroups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
      {navGroups.map((group, i) => (
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

export function PortalSidebar({
  navGroups,
  homeHref,
  userLabel,
}: {
  navGroups: NavGroup[];
  homeHref: string;
  userLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/30 bg-white/50 px-4 py-3 shadow-[0_8px_32px_rgba(23,38,61,0.1)] backdrop-blur-xl lg:hidden">
        <Link href={homeHref} className="flex items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={48} height={48} />
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
          <NavLinks
            navGroups={navGroups}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/30 pt-3">
            <span className="truncate text-xs text-slate-600">{userLabel}</span>
            <LogoutButton />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col gap-4 rounded-3xl border border-white/30 bg-white/50 p-4 shadow-[0_8px_32px_rgba(23,38,61,0.1)] backdrop-blur-xl lg:flex">
        <Link href={homeHref} className="flex items-center gap-2 px-1">
          <Image src="/logo.png" alt="Sari Les Renang" width={56} height={56} />
          <span className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">
            Sari Les Renang
          </span>
        </Link>
        <NavLinks navGroups={navGroups} pathname={pathname} />
        <div className="flex flex-col gap-2 border-t border-white/30 pt-3">
          <span className="truncate text-xs text-slate-600">{userLabel}</span>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
