"use client";

import { useState } from "react";

type FaqItem = { id: string; question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="overflow-hidden rounded-2xl border border-white/30 bg-white/20 backdrop-blur-md"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="font-medium text-[#17263D]">{item.question}</span>
              <span
                className={`shrink-0 text-[#35C5D0] transition-transform ${isOpen ? "rotate-180" : ""}`}
              >
                &#9660;
              </span>
            </button>
            {isOpen && (
              <p className="whitespace-pre-line px-5 pb-4 text-sm text-slate-700">
                {item.answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
