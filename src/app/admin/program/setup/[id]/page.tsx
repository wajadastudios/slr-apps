import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { Badge, PageHeader } from "@/components/admin/ui";
import { ImpactConfirm } from "@/components/admin/impact-confirm";
import { ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { isAudience } from "@/lib/program-audience";
import { AudienceForm } from "./audience-form";
import { loadReadiness, PROGRAM_SETUP_COLUMNS, type SetupProgramRow } from "@/lib/admin/readiness-load";
import { programChecklist, readyBlockers } from "@/lib/admin/readiness";
import { saveAudienceAction, setRegistrationOpenAction } from "../actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const TEMPLATE_NOTE: Record<string, string> = {
  observation:
    "Program ini memakai catatan observasi, bukan bintang dan bukan rekor. Indikatornya khusus program ini; indikator dan rekor Kids tidak dipakai.",
  support_level:
    "Program ini memakai tingkat dukungan (mis. dengan bantuan sebagian, mandiri) dan target pribadi. Ini catatan pembelajaran renang, bukan diagnosis medis, dan tidak ditampilkan sebagai diagnosis kepada orang tua.",
};

function Check({ done, optional }: { done: boolean; optional?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        done ? "bg-[#DDF7EC] text-[#0E5A43]" : optional ? "bg-slate-200 text-slate-500" : "bg-[#FFF1CC] text-[#7A5400]"
      }`}
    >
      {done ? "✓" : optional ? "–" : "!"}
    </span>
  );
}

export default async function ProgramSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("programs").select(PROGRAM_SETUP_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const program = data as SetupProgramRow;

  // registrations and participants that belong to this program
  const { count: related } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("program_id", program.id)
    .not("status", "in", "(cancelled,rejected)");

  const input = await loadReadiness(supabase, program);
  const steps = programChecklist(input);
  const blockers = readyBlockers(input);
  const ready = blockers.length === 0;
  const note = TEMPLATE_NOTE[input.program.assessment_type];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/program/setup" className="w-fit text-sm font-semibold text-[#0B6470] hover:underline">
        &lsaquo; Semua program
      </Link>
      <PageHeader
        title={`Atur Program: ${program.name}`}
        subtitle="Selesaikan langkah di bawah, lalu buka program untuk pendaftar."
        actions={
          !program.active ? <Badge>Nonaktif</Badge> : program.registration_open ? <Badge tone="ok">Menerima pendaftar</Badge> : ready ? <Badge tone="info">Siap dibuka</Badge> : <Badge tone="warn">Belum siap</Badge>
        }
      />
      {error && (
        <p role="alert" className="rounded-xl bg-[#FFF0F3] px-4 py-3 text-sm text-[#7A1B36]">
          {decodeURIComponent(error)}
        </p>
      )}
      {note && <p className="rounded-xl bg-[#DDF3F6] px-4 py-3 text-sm text-[#0B6470]">{note}</p>}

      <GlassCard className="flex flex-col gap-3">
        <h2 className={HEADING}>Target Peserta &amp; Jalur Pendaftaran</h2>
        <AudienceForm
          key={program.audience ?? "child"}
          programId={program.id}
          initial={isAudience(program.audience) ? program.audience : "child"}
          relatedCount={related ?? 0}
          action={saveAudienceAction}
        />
      </GlassCard>

      <GlassCard className="flex flex-col gap-1">
        <h2 className={`mb-2 ${HEADING}`}>Langkah penyiapan</h2>
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={s.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Check done={s.done} optional={s.optional && !s.done} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#17263D]">
                    {i + 1}. {s.label}
                  </p>
                  <p className="text-xs text-slate-600">{s.detail}</p>
                </div>
              </div>
              <Link href={s.href} className={`inline-flex min-h-10 items-center rounded-2xl border px-4 text-sm font-semibold ${s.done ? SECONDARY_BUTTON : ADMIN_CTA}`}>
                {s.done ? "Buka" : "Kerjakan"}
              </Link>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/60 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Check done={program.registration_open === true} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#17263D]">{steps.length + 1}. Siap menerima pendaftar</p>
                <p className="text-xs text-slate-600">
                  {program.registration_open
                    ? "Program tampil di formulir pendaftaran."
                    : ready
                      ? "Semua syarat minimal terpenuhi. Buka program agar tampil di formulir pendaftaran."
                      : "Syarat minimal: nama dan kategori, paket aktif, slot aktif, pengajar, dan template penilaian."}
                </p>
                {!ready && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-[#7A5400]">
                    {blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <ToastForm action={setRegistrationOpenAction} className="flex items-center" pendingLabel="Menyimpan...">
              <input type="hidden" name="id" value={program.id} />
              {program.registration_open ? (
                <ImpactConfirm
                  label="Tutup pendaftaran"
                  title={`Tutup pendaftaran ${program.name}?`}
                  impacts={[
                    "Program tidak lagi tampil di formulir pendaftaran baru.",
                    "Pendaftar dan peserta yang sudah ada tidak terpengaruh.",
                    "Anda dapat membukanya lagi kapan saja.",
                  ]}
                  name="open"
                  value="0"
                  destructive
                  confirmLabel="Ya, tutup"
                />
              ) : (
                <GlassButton type="submit" name="open" value="1" disabled={!ready || !program.active} className={`${ADMIN_CTA} px-5 py-2 text-sm`}>
                  Buka untuk pendaftar
                </GlassButton>
              )}
            </ToastForm>
          </li>
        </ol>
      </GlassCard>
    </div>
  );
}
