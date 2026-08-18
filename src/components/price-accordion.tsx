"use client";

import { useState } from "react";

const PACKAGE_BADGES: Record<string, { label: string; className: string }> = {
  promo: { label: "Promo", className: "bg-[#FFC800] text-[#5c4400]" },
  diskon: { label: "Diskon", className: "bg-[#FF8A65] text-white" },
  best_deal: { label: "Best Deal", className: "bg-[#35C5D0] text-white" },
  direkomendasikan: {
    label: "Direkomendasikan",
    className: "bg-[#55D6A6] text-white",
  },
};

type Pkg = {
  id: string;
  name: string;
  sessions_count: number;
  price: number;
  benefits: string[] | null;
  badge: string | null;
};

export type PriceGroup = {
  programId: string;
  programName: string;
  packages: Pkg[];
};

export function PriceAccordion({ groups }: { groups: PriceGroup[] }) {
  const [openId, setOpenId] = useState<string | null>(
    groups[0]?.programId ?? null
  );

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const isOpen = openId === group.programId;
        const cheapest = Math.min(...group.packages.map((p) => Number(p.price)));

        return (
          <div
            key={group.programId}
            className="overflow-hidden rounded-3xl border border-white/30 bg-white/20 shadow-[0_8px_32px_rgba(23,38,61,0.15)] backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : group.programId)}
              className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
            >
              <span>
                <span className="block text-lg font-semibold text-[#17263D]">
                  {group.programName}
                </span>
                <span className="block text-xs text-slate-600">
                  {group.packages.length} paket &middot; mulai Rp
                  {cheapest.toLocaleString("id-ID")}
                </span>
              </span>
              <span
                className={`shrink-0 text-[#35C5D0] transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                &#9660;
              </span>
            </button>

            {isOpen && (
              <div className="grid gap-3 px-6 pb-6 sm:grid-cols-2">
                {group.packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="relative rounded-xl border border-[#35C5D0]/30 bg-white/20 p-3 backdrop-blur-md"
                  >
                    {pkg.badge && PACKAGE_BADGES[pkg.badge] && (
                      <span
                        className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PACKAGE_BADGES[pkg.badge].className}`}
                      >
                        {PACKAGE_BADGES[pkg.badge].label}
                      </span>
                    )}
                    <p className="font-medium text-[#17263D]">
                      {pkg.name} &middot; {pkg.sessions_count} sesi
                    </p>
                    <p className="text-lg font-semibold text-[#17263D]">
                      Rp{Number(pkg.price).toLocaleString("id-ID")}
                    </p>
                    {pkg.benefits && pkg.benefits.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                        {pkg.benefits.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
