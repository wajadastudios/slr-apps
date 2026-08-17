import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { InvoiceShareLinks } from "@/components/invoice-share-links";
import { createInvoiceForStudentAction, sendInvoiceAction, markPaidAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  sent: "Terkirim",
  paid: "Sudah Bayar",
};

export default async function TagihanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const origin = await getSiteOrigin();

  const [
    { data: invoices },
    { data: students },
    { data: packages },
    { data: hadirReports },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, student_id, package_name, sessions_count, amount, status, student:student_id(full_name, parent:parent_id(email))"
      )
      .order("id", { ascending: false }),
    supabase
      .from("students")
      .select("id, full_name, program_id, next_package_preference_id")
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("program_packages")
      .select("id, program_id, name, sessions_count, price")
      .eq("active", true)
      .order("sessions_count"),
    supabase.from("progress_reports").select("student_id").eq("attendance", "hadir"),
  ]);

  const hadirCount = new Map<string, number>();
  for (const r of hadirReports ?? []) {
    hadirCount.set(r.student_id, (hadirCount.get(r.student_id) ?? 0) + 1);
  }

  const sessionsAccounted = new Map<string, number>();
  for (const inv of invoices ?? []) {
    sessionsAccounted.set(
      inv.student_id,
      (sessionsAccounted.get(inv.student_id) ?? 0) + inv.sessions_count
    );
  }

  const dueStudents = (students ?? []).filter((s) => {
    const attended = hadirCount.get(s.id) ?? 0;
    return attended > 0 && attended >= (sessionsAccounted.get(s.id) ?? 0);
  });
  const notDueStudents = (students ?? []).filter(
    (s) => !dueStudents.some((d) => d.id === s.id)
  );

  const packagesByProgram = new Map<string, typeof packages>();
  for (const p of packages ?? []) {
    const list = packagesByProgram.get(p.program_id) ?? [];
    list.push(p);
    packagesByProgram.set(p.program_id, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-2 ${HEADING}`}>Siswa Siap Ditagih</h2>
        <p className="mb-4 text-sm text-slate-600">
          Muncul saat sesi hadir siswa melebihi jumlah sesi yang sudah pernah
          ditagihkan. Pilih paket untuk membuat draft tagihan berikutnya.
        </p>
        {error && (
          <p className="mb-3 text-sm text-red-700">
            {decodeURIComponent(error)}
          </p>
        )}

        {dueStudents.length === 0 && (
          <p className="text-sm text-slate-600">
            Belum ada siswa yang siap ditagih.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {dueStudents.map((s) => {
            const options = packagesByProgram.get(s.program_id) ?? [];
            return (
              <form key={s.id} action={createInvoiceForStudentAction}>
                <input type="hidden" name="student_id" value={s.id} />
                <DataRow
                  primary={s.full_name}
                  secondary={`${hadirCount.get(s.id) ?? 0} sesi hadir · ${
                    sessionsAccounted.get(s.id) ?? 0
                  } sesi sudah ditagih`}
                  action={
                    <>
                      <GlassSelect
                        name="program_package_id"
                        required
                        defaultValue={s.next_package_preference_id ?? ""}
                        className="min-w-[200px]"
                      >
                        <option value="" disabled>
                          Pilih paket
                        </option>
                        {options?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} &middot; {p.sessions_count} sesi &middot;
                            Rp{Number(p.price).toLocaleString("id-ID")}
                            {p.id === s.next_package_preference_id
                              ? " (pilihan orang tua)"
                              : ""}
                          </option>
                        ))}
                      </GlassSelect>
                      <GlassButton
                        type="submit"
                        disabled={!options || options.length === 0}
                        className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
                      >
                        Buat Tagihan
                      </GlassButton>
                    </>
                  }
                />
              </form>
            );
          })}
        </div>

        {notDueStudents.length > 0 && (
          <div className="mt-4 border-t border-white/30 pt-4">
            <p className="mb-2 text-sm text-slate-800">Progres siswa lain:</p>
            <div className="flex flex-wrap gap-2">
              {notDueStudents.map((s) => {
                const total = sessionsAccounted.get(s.id) ?? 0;
                const attended = hadirCount.get(s.id) ?? 0;
                return (
                  <span
                    key={s.id}
                    className="rounded-full border border-white/30 bg-white/40 px-3 py-1 text-xs text-slate-700"
                  >
                    {s.full_name}: {total > 0 ? `${attended}/${total} sesi` : "belum ada paket"}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Daftar Tagihan</h2>
        <div className="flex flex-col gap-2">
          {(!invoices || invoices.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada tagihan.</p>
          )}
          {invoices?.map((inv) => {
            const student = inv.student as unknown as {
              full_name: string;
              parent: { email: string } | null;
            } | null;

            return (
              <DataRow
                key={inv.id}
                primary={
                  <>
                    {student?.full_name} &mdash; {inv.package_name} (
                    {inv.sessions_count} sesi)
                  </>
                }
                secondary={
                  <div className="flex flex-col gap-1">
                    <span>{STATUS_LABEL[inv.status] ?? inv.status}</span>
                    {(inv.status === "sent" || inv.status === "paid") && (
                      <InvoiceShareLinks
                        origin={origin}
                        invoiceId={inv.id}
                        studentName={student?.full_name ?? ""}
                        parentEmail={student?.parent?.email}
                      />
                    )}
                  </div>
                }
                action={
                  <>
                    {inv.status === "draft" && (
                      <form
                        action={sendInvoiceAction}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <GlassInput
                          name="amount"
                          type="number"
                          min={1}
                          placeholder="Nominal (Rp)"
                          defaultValue={inv.amount > 0 ? inv.amount : undefined}
                          className="w-32"
                          required
                        />
                        <GlassButton
                          type="submit"
                          className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
                        >
                          Setujui &amp; Kirim
                        </GlassButton>
                      </form>
                    )}

                    {inv.status === "sent" && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[#17263D]">
                          Rp{Number(inv.amount).toLocaleString("id-ID")}
                        </span>
                        <form action={markPaidAction}>
                          <input type="hidden" name="invoice_id" value={inv.id} />
                          <GlassButton
                            type="submit"
                            className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
                          >
                            Tandai Sudah Bayar
                          </GlassButton>
                        </form>
                      </div>
                    )}

                    {inv.status === "paid" && (
                      <span className="text-sm font-medium text-[#1a8f6f]">
                        Rp{Number(inv.amount).toLocaleString("id-ID")} &mdash; Lunas
                      </span>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
