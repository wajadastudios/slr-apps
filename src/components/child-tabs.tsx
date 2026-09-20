import Link from "next/link";
import { CHILD_TABS, childHref, type ChildTab } from "@/lib/report-preview";

// Segmented control that is really three links: the active tab lives in the
// URL (?tab=), so it survives a refresh and can be shared. Tab switches
// replace the history entry, so the browser Back button goes straight back
// to Ringkasan instead of stepping through every tab.
export function ChildTabs({ studentId, active }: { studentId: string; active: ChildTab }) {
  return (
    <nav
      aria-label="Bagian detail anak"
      className="sticky top-2 z-20 grid grid-cols-3 gap-1 rounded-2xl border border-white/60 bg-white/80 p-1 shadow-[0_4px_16px_rgba(23,38,61,0.10)] backdrop-blur-xl"
    >
      {CHILD_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={childHref(studentId, tab.id)}
            replace
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0] ${
              isActive
                ? "bg-[#35C5D0] text-white shadow-[0_2px_10px_rgba(53,197,208,0.4)]"
                : "text-slate-600 hover:bg-[#35C5D0]/15 active:bg-[#35C5D0]/25"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
