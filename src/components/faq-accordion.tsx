"use client";

import { useState } from "react";
import { AccordionItem } from "@/components/ui/accordion";

type FaqItem = { id: string; question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <AccordionItem
            key={item.id}
            open={isOpen}
            onToggle={() => setOpenId(isOpen ? null : item.id)}
            className="overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-[0_2px_14px_rgba(23,38,61,0.06)] backdrop-blur-md"
            headerClassName="px-5 py-3"
            header={
              <span className="font-medium text-[#17263D]">{item.question}</span>
            }
          >
            <p className="whitespace-pre-line px-5 pb-4 text-sm text-slate-700">
              {item.answer}
            </p>
          </AccordionItem>
        );
      })}
    </div>
  );
}
