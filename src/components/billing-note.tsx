import type { BillingNote } from "@/lib/billing";

// Shown on a participant whose invoices another account pays. It says who is
// responsible and whether it is settled -- never an amount or a payment link.
export function BillingNoteLine({ note }: { note: BillingNote | null }) {
  if (!note) return null;
  return (
    <p className="rounded-2xl bg-slate-100/80 px-3.5 py-2 text-xs text-slate-600">
      <span className="font-semibold text-slate-700">{note.line}</span>
      {note.status && <span className="block">{note.status}</span>}
    </p>
  );
}
