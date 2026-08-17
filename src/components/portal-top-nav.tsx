"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

export function PortalTopNav({
  navItems,
  userLabel,
  homeHref,
}: {
  navItems: { href: string; label: string }[];
  userLabel: string;
  homeHref: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/30 bg-white/50 px-5 py-4 shadow-[0_8px_32px_rgba(23,38,61,0.1)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-4">
        <Link href={homeHref} className="flex items-center gap-2">
          <Image src="/logo.png" alt="Sari Les Renang" width={28} height={28} />
          <span className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">
            Sari Les Renang
          </span>
        </Link>
        <nav className="flex flex-wrap gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#35C5D0] text-white"
                    : "text-slate-700 hover:bg-white/60"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-700">{userLabel}</span>
        <LogoutButton />
      </div>
    </div>
  );
}
