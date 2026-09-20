"use client";

import { useState, type ReactNode } from "react";
import { AccordionItem } from "@/components/ui/accordion";

// Accordion whose content is rendered on the server (forms, lists) and
// passed in as children; only the open/closed state lives here.
export function GroupAccordion({
  header,
  children,
  defaultOpen = false,
  muted = false,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  muted?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className={`rounded-2xl border border-white/60 bg-white/55 ${muted ? "opacity-75" : ""}`}
      headerClassName="min-h-14 rounded-2xl px-4 py-2"
      header={header}
    >
      {children}
    </AccordionItem>
  );
}
