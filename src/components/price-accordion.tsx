"use client";

import { useState } from "react";
import { AccordionItem } from "@/components/ui/accordion";

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
    (
      groups.find((g) => g.programName.toLowerCase().includes("kids swim")) ??
      groups[0]
    )?.programId ?? null
  );

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const isOpen = openId === group.programId;
        const cheapest = Math.min(...group.packages.map((p) => Number(p.price)));

        return (
          <AccordionItem
            key={group.programId}
            open={isOpen}
            onToggle={() => setOpenId(isOpen ? null : group.programId)}
            className="overflow-hidden rounded-3xl border border-white/40 bg-white/45 shadow-[0_4px_20px_rgba(23,38,61,0.08)] backdrop-blur-xl"
            headerClassName="px-6 py-3"
            header={
              <span>
                <span className="block text-lg font-semibold text-[#17263D]">
                  {group.programName}
                </span>
                <span className="block text-xs text-slate-600">
                  {group.packages.length} paket &middot; mulai Rp
                  {cheapest.toLocaleString("id-ID")}
                </span>
              </span>
            }
          >
            <div className="grid gap-3 px-6 pb-6 pt-1 sm:grid-cols-2">
              {group.packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="rounded-xl border border-[#35C5D0]/30 bg-white/50 p-3 backdrop-blur-md"
                >
                  {pkg.badge && PACKAGE_BADGES[pkg.badge] && (
                    <div className="mb-2 flex justify-end">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PACKAGE_BADGES[pkg.badge].className}`}
                      >
                        {PACKAGE_BADGES[pkg.badge].label}
                      </span>
                    </div>
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
          </AccordionItem>
        );
      })}
    </div>
  );
}
