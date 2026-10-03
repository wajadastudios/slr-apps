// Route-level loading states (used by loading.tsx). Each variant mirrors the
// layout of the page it stands in for, so content replaces the skeleton in
// place instead of the page jumping. The sidebar lives in the layout and is
// untouched while this shows. `data-loading` lets tooling detect it.

const CARD = "rounded-3xl border border-white/40 bg-white/45 p-5 shadow-[0_2px_14px_rgba(23,38,61,0.06)]";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-300/45 ${className}`} />;
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div data-loading className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Portal dashboards (orang tua / pengajar): heading + summary cards. */
export function DashboardSkeleton() {
  return (
    <Shell label="Memuat ringkasan…">
      <div className={`${CARD} flex flex-col gap-3`}>
        <Bar className="h-6 w-56" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className={`${CARD} flex flex-col gap-3`}>
          <div className="flex items-center gap-3">
            <Bar className="h-10 w-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Bar className="h-4 w-48" />
              <Bar className="h-3 w-32" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Bar className="h-16 rounded-2xl" />
            <Bar className="h-16 rounded-2xl" />
          </div>
          <Bar className="h-20 rounded-2xl" />
        </div>
      ))}
    </Shell>
  );
}

/** Participant detail: header card with two info blocks, tabs, report card. */
export function DetailSkeleton() {
  return (
    <Shell label="Memuat detail…">
      <div className={`${CARD} flex flex-col gap-3`}>
        <Bar className="h-4 w-24" />
        <Bar className="h-6 w-64 max-w-full" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Bar className="h-14 rounded-2xl" />
          <Bar className="h-14 rounded-2xl" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <Bar className="h-10 w-24 rounded-xl" />
        <Bar className="h-10 w-32 rounded-xl" />
        <Bar className="h-10 w-20 rounded-xl" />
      </div>
      <div className={`${CARD} flex flex-col gap-3`}>
        <Bar className="h-5 w-40" />
        <Bar className="h-4 w-56" />
        <Bar className="h-20 rounded-2xl" />
        <Bar className="h-11 rounded-xl" />
        <Bar className="h-11 rounded-xl" />
      </div>
    </Shell>
  );
}

/** Admin pages: title, filter/action row, a table/list of rows. */
export function TableSkeleton() {
  return (
    <Shell label="Memuat data…">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bar className="h-7 w-52" />
        <Bar className="h-10 w-36 rounded-2xl" />
      </div>
      <div className={`${CARD} flex flex-wrap gap-2`}>
        <Bar className="h-10 w-40 rounded-xl" />
        <Bar className="h-10 w-32 rounded-xl" />
        <Bar className="h-10 w-28 rounded-xl" />
      </div>
      <div className={`${CARD} flex flex-col gap-2.5`}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="h-9 w-9 rounded-full" />
            <Bar className="h-4 flex-1" />
            <Bar className="hidden h-4 w-24 sm:block" />
            <Bar className="h-8 w-20 rounded-xl" />
          </div>
        ))}
      </div>
    </Shell>
  );
}
