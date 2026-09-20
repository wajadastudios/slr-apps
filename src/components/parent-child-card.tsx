import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { GHOST_BUTTON } from "@/lib/ui-classes";
import { attendanceLabel, childHref, type ReportPreview } from "@/lib/report-preview";
import type { CardLinks } from "@/lib/programs";
import type { RecordSummary } from "@/lib/record-summary";
import { MEDAL_NAME, TierMedal } from "@/components/ui/tier-medal";

const CTA_BASE =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0] focus-visible:ring-offset-2 focus-visible:ring-offset-white/60 active:scale-[0.98]";
const CTA_PRIMARY = `${CTA_BASE} bg-[#35C5D0] text-white shadow-[0_4px_14px_rgba(53,197,208,0.35)] hover:-translate-y-px hover:bg-[#22B8C7] hover:shadow-[0_6px_18px_rgba(53,197,208,0.45)] active:bg-[#1597A3]`;
const CTA_OUTLINE = `${CTA_BASE} border border-[#35C5D0]/60 bg-white/60 text-[#1597A3] hover:bg-[#35C5D0]/15 active:bg-[#35C5D0]/25`;
const TEXT_LINK = `inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-[#1597A3] underline-offset-4 hover:underline ${GHOST_BUTTON}`;

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4.5 10h11M11 5.5L15.5 10 11 14.5" />
    </svg>
  );
}

// One child on the parent's Ringkasan. The card itself is not a link: the
// primary button says exactly where it goes, so there is nothing to guess.
export function ParentChildCard({
  studentId,
  programId,
  name,
  program,
  links,
  nextSessionLabel,
  quota,
  preview,
  record = null,
}: {
  studentId: string;
  // the enrollment this card is about (a person can have several)
  programId: string;
  name: string;
  program: string | null;
  links: CardLinks;
  nextSessionLabel: string | null;
  // e.g. { value: "3 / 8 sesi diikuti", note: "Sisa 5 sesi" }
  quota: { value: string; note: string };
  preview: ReportPreview | null;
  // compact Record Unlock block (adult class participants only)
  record?: RecordSummary | null;
}) {
  const [nextMain, ...nextRest] = (nextSessionLabel ?? "").split(" · ");
  const attendance = attendanceLabel(preview?.attendance);

  return (
    <GlassCard id={`anak-${studentId}-${programId}`} className="flex scroll-mt-6 flex-col gap-4 !bg-white/85">
      <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold leading-tight text-[#17263D]">
        {name}
        <span className="font-medium text-slate-500"> · {program ?? "Belum ada program"}</span>
      </h2>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#FFC800]/45 bg-gradient-to-br from-[#FFF3C4] to-[#FFF8E1] px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-[#8a6900]">Sesi berikutnya</p>
          {nextSessionLabel ? (
            <p className="text-sm font-semibold leading-snug text-[#17263D]">
              {nextMain}
              {nextRest.length > 0 && (
                <span className="font-normal text-slate-700"> · {nextRest.join(" · ")}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-slate-600">Belum ada jadwal</p>
          )}
        </div>
        <div className="rounded-2xl bg-[#EEF9FB] px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-slate-500">Kuota sesi</p>
          <p className="text-sm font-semibold leading-snug text-[#17263D]">{quota.note}</p>
          <p className="text-[11px] text-slate-500">{quota.value}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3">
        <p className="text-[11px] font-medium text-slate-500">{links.latestLabel}</p>
        {preview ? (
          <>
            <p className="mt-0.5 text-xs text-slate-500">
              {preview.sessionNumber ? `Sesi ${preview.sessionNumber} · ` : ""}
              {preview.dateLabel}
              {attendance ? ` · ${attendance}` : ""}
            </p>
            {preview.note ? (
              <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-[#17263D]">
                &ldquo;{preview.note}&rdquo;
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-slate-500">Belum ada catatan tertulis dari pelatih.</p>
            )}
          </>
        ) : (
          <>
            <p className="mt-0.5 text-sm font-semibold text-[#17263D]">{links.emptyTitle}</p>
            <p className="mt-0.5 text-sm text-slate-600">{links.emptyBody}</p>
          </>
        )}
      </div>

      {record && (
        <div className="rounded-2xl border border-[#35C5D0]/25 bg-[#EEF9FB]/70 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1597A3]">Record Unlock</p>
            <Link
              href={childHref(studentId, "record", undefined, programId)}
              className={`inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-semibold text-[#1597A3] ${GHOST_BUTTON}`}
            >
              Lihat Record
            </Link>
          </div>
          {record.top ? (
            <>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#17263D]">
                <TierMedal tier={record.top.tier} size={24} decorative />
                {MEDAL_NAME[record.top.tier]} terbaru
              </p>
              <p className="text-sm text-slate-700">
                {record.top.label}
                {record.top.valueText ? ` · ${record.top.valueText}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {record.unlocked} dari {record.total} rekor terbuka
              </p>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-slate-500">
                {record.unlocked} dari {record.total} rekor terbuka
              </p>
              {record.first && (
                <>
                  <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-[#17263D]">
                    <TierMedal tier={record.first.tier} size={24} decorative />
                    Target pertama
                  </p>
                  <p className="text-sm text-slate-700">
                    {record.first.label} &middot; {record.first.valueText}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {preview ? (
          <>
            <Link
              href={childHref(studentId, links.primaryTab, links.primaryHash, programId)}
              className={CTA_PRIMARY}
            >
              {links.primaryLabel}
              <ArrowIcon />
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-x-1 text-slate-300">
              {links.secondary.map((l, i) => (
                <span key={l.label} className="inline-flex items-center gap-x-1">
                  {i > 0 && <span aria-hidden="true">·</span>}
                  <Link href={childHref(studentId, l.tab, l.hash, programId)} className={TEXT_LINK}>
                    {l.label}
                  </Link>
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <Link href={childHref(studentId, links.primaryTab, undefined, programId)} className={CTA_OUTLINE}>
              {links.emptyPrimaryLabel}
              <ArrowIcon />
            </Link>
            <div className="flex justify-center">
              <Link
                href={childHref(studentId, links.secondary[links.secondary.length - 1].tab, undefined, programId)}
                className={TEXT_LINK}
              >
                {links.secondary[links.secondary.length - 1].label}
              </Link>
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}
