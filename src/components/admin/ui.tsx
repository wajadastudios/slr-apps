import Link from "next/link";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GHOST_BUTTON } from "@/lib/ui-classes";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-[#DDF7EC] text-[#0E5A43]",
  warn: "bg-[#FFF1CC] text-[#7A5400]",
  danger: "bg-[#FFE3EA] text-[#A3183C]",
  info: "bg-[#DDF3F6] text-[#0B6470]",
  neutral: "bg-slate-200/80 text-slate-700",
};

// One badge look for every status in the admin area.
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// An empty list always says what to do next.
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-2xl border border-dashed border-slate-300/80 bg-white/40 px-5 py-6">
      <p className="text-sm font-semibold text-[#17263D]">{title}</p>
      {hint && <p className="text-sm text-slate-600">{hint}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

export type TabDef = { key: string; label: string; href: string; count?: number };

// Tabs are plain links (state lives in the URL), so every filtered view has a
// deep link the dashboard can point to.
export function TabLinks({ tabs, active, label }: { tabs: TabDef[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          replace
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition-colors",
            t.key === active
              ? "bg-[#0E7C89] text-white shadow-[0_2px_10px_rgba(14,124,137,0.3)]"
              : cn("border border-white/60 bg-white/60 text-slate-700", GHOST_BUTTON)
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                t.key === active ? "bg-white/25 text-white" : "bg-slate-200/80 text-slate-700"
              )}
            >
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

// A GET form for search/filters: everything stays in the URL.
export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form
      action={action}
      method="get"
      className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/50 bg-white/50 p-3"
    >
      {children}
    </form>
  );
}

export const FIELD_CLASS =
  "min-h-10 rounded-xl border border-white/60 bg-white/70 px-3 text-sm text-slate-900 outline-none focus:border-[#0E7C89]";

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/55 px-3.5 py-2.5">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="font-[family-name:var(--font-quicksand)] text-xl font-bold leading-tight text-[#17263D]">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
