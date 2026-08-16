import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { InvoiceShareLinks } from "@/components/invoice-share-links";
import { createInvoiceForStudentAction, sendInvoiceAction, markPaidAction } from "./actions";

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
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          Murid Siap Ditagih
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Muncul saat sesi hadir murid melebihi jumlah sesi yang sudah pernah
          ditagihkan. Pilih paket untuk membuat draft tagihan berikutnya.
        </p>
        {error && (
          <p className="mb-3 text-sm text-red-700 dark:text-red-300">
            {decodeURIComponent(error)}
          </p>
        )}

        {dueStudents.length === 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Belum ada murid yang siap ditagih.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {dueStudents.map((s) => {
            const options = packagesByProgram.get(s.program_id) ?? [];
            return (
              <form
                key={s.id}
                action={createInvoiceForStudentAction}
                className="flex flex-wrap items-end gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3"
              >
                <input type="hidden" name="student_id" value={s.id} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {s.full_name}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {hadirCount.get(s.id) ?? 0} sesi hadir &middot;{" "}
                    {sessionsAccounted.get(s.id) ?? 0} sesi sudah ditagih
                  </p>
                </div>
                <GlassSelect
                  name="program_package_id"
                  required
                  defaultValue={s.next_package_preference_id ?? ""}
                  className="min-w-[220px]"
                >
                  <option value="" disabled>
                    Pilih paket
                  </option>
                  {options?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} &middot; {p.sessions_count} sesi &middot; Rp
                      {Number(p.price).toLocaleString("id-ID")}
                      {p.id === s.next_package_preference_id
                        ? " (pilihan orang tua)"
                        : ""}
                    </option>
                  ))}
                </GlassSelect>
                <GlassButton
                  type="submit"
                  disabled={!options || options.length === 0}
                  className="px-4 py-2 text-sm"
                >
                  Buat Tagihan
                </GlassButton>
              </form>
            );
          })}
        </div>

        {notDueStudents.length > 0 && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <p className="mb-2 text-sm text-slate-800 dark:text-slate-200">
              Progres murid lain:
            </p>
            <div className="flex flex-wrap gap-2">
              {notDueStudents.map((s) => {
                const total = sessionsAccounted.get(s.id) ?? 0;
                const attended = hadirCount.get(s.id) ?? 0;
                return (
                  <span
                    key={s.id}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-700 dark:text-slate-300"
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
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Daftar Tagihan
        </h2>
        <div className="flex flex-col gap-3">
          {(!invoices || invoices.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada tagihan.
            </p>
          )}
          {invoices?.map((inv) => {
            const student = inv.student as unknown as {
              full_name: string;
              parent: { email: string } | null;
            } | null;

            return (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {student?.full_name} &mdash; {inv.package_name} (
                    {inv.sessions_count} sesi)
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {STATUS_LABEL[inv.status] ?? inv.status}
                  </p>
                  {(inv.status === "sent" || inv.status === "paid") && (
                    <div className="mt-1">
                      <InvoiceShareLinks
                        origin={origin}
                        invoiceId={inv.id}
                        studentName={student?.full_name ?? ""}
                        parentEmail={student?.parent?.email}
                      />
                    </div>
                  )}
                </div>

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
                      className="w-36"
                      required
                    />
                    <GlassButton type="submit" className="px-4 py-2 text-sm">
                      Setujui &amp; Kirim
                    </GlassButton>
                  </form>
                )}

                {inv.status === "sent" && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      Rp{Number(inv.amount).toLocaleString("id-ID")}
                    </span>
                    <form action={markPaidAction}>
                      <input type="hidden" name="invoice_id" value={inv.id} />
                      <GlassButton type="submit" className="px-4 py-2 text-sm">
                        Tandai Sudah Bayar
                      </GlassButton>
                    </form>
                  </div>
                )}

                {inv.status === "paid" && (
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Rp{Number(inv.amount).toLocaleString("id-ID")} &mdash; Lunas
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
