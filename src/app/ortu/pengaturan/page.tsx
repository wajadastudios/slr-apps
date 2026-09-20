import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import {
  updateOwnProfileAction,
  updateChildProfileAction,
  updateParticipantProfileAction,
  setReportAccessAction,
} from "./actions";
import { GlassSelect } from "@/components/ui/glass-select";
import { loadEnrollments } from "@/lib/enrollment-server";
import { GENDER_OPTIONS, genderLabel } from "@/lib/registration-input";
import { STATUS_LABEL } from "@/lib/enrollment";
import { ToastForm } from "@/components/ui/toast-form";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function OrtuPengaturanPage() {
  const session = await getUserWithRole();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, phone, address, avatar_url")
    .eq("id", session?.user.id ?? "")
    .single();

  const { data: people } = await supabase
    .from("students")
    .select("id, full_name, nickname, avatar_url, kind, user_id, parent_id, is_self, gender, phone, birth_date, relationship")
    .order("full_name");

  const me = session?.user.id ?? "";
  // children: their parent manages the profile
  const children = (people ?? []).filter((p) => p.kind === "child");
  // ME as a participant: my own account, or an adult profile I made for myself
  const myParticipants = (people ?? []).filter((p) => p.user_id === me || (p.is_self && p.parent_id === me));
  // adults I registered for someone else: I keep the administrative side only
  const registeredByMe = (people ?? []).filter(
    (p) => p.kind === "adult_family" && p.parent_id === me && p.user_id !== me
  );
  const enrollments = await loadEnrollments(
    supabase,
    [...myParticipants, ...registeredByMe].map((p) => p.id)
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Pengaturan
      </h1>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Profil Saya</h2>
        <ToastForm
          action={updateOwnProfileAction}
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="current_avatar_url"
            value={profile?.avatar_url ?? ""}
          />
          <div className="flex items-center gap-4">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EEF9FB] text-2xl">
                👤
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Foto (opsional)</label>
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#35C5D0] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Nama Lengkap</label>
              <GlassInput
                name="full_name"
                defaultValue={profile?.full_name ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                Nomor WhatsApp
              </label>
              <GlassInput name="phone" defaultValue={profile?.phone ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Alamat</label>
            <GlassTextarea
              name="address"
              rows={2}
              defaultValue={profile?.address ?? ""}
            />
          </div>
          <GlassButton
            type="submit"
            className={`${PRIMARY_BUTTON} w-fit`}
          >
            Simpan Profil
          </GlassButton>
        </ToastForm>
      </GlassCard>

      {myParticipants.map((p) => {
        const sharedByOthers = p.parent_id !== me; // registered by someone else
        const own = enrollments.filter((e) => e.student_id === p.id && e.status !== "cancelled" && e.status !== "rejected");
        return (
          <GlassCard key={p.id}>
            <h2 className={`mb-1 ${HEADING}`}>Profil Peserta</h2>
            <p className="mb-4 text-sm text-slate-600">
              Data ini milik peserta ({p.full_name}), bukan bagian dari akun login. Jenis kelamin hanya membantu admin
              menyesuaikan program dan tidak menjadi satu-satunya syarat.
            </p>
            <ToastForm action={updateParticipantProfileAction} className="flex flex-col gap-4">
              <input type="hidden" name="student_id" value={p.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">Jenis Kelamin</label>
                  <GlassSelect name="gender" defaultValue={p.gender ?? ""} glassChevron>
                    <option value="">Belum diisi</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </GlassSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">Nomor WhatsApp</label>
                  <GlassInput name="phone" type="tel" defaultValue={p.phone ?? ""} placeholder="08xxxxxxxxxx" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">Tanggal Lahir</label>
                  <GlassInput name="birth_date" type="date" defaultValue={p.birth_date ?? ""} />
                </div>
              </div>
              <GlassButton type="submit" className={`${PRIMARY_BUTTON} w-fit`}>
                Simpan Profil Peserta
              </GlassButton>
            </ToastForm>

            {sharedByOthers && own.length > 0 && (
              <div className="mt-5 flex flex-col gap-3 border-t border-white/40 pt-4">
                <h3 className="text-sm font-semibold text-[#17263D]">Berbagi dengan pendaftar</h3>
                <p className="text-sm text-slate-600">
                  Anda didaftarkan oleh orang lain. Secara bawaan, pendaftar hanya melihat status pendaftaran. Jadwal dan
                  laporan kelas Anda tetap pribadi kecuali Anda mengizinkan.
                </p>
                {own.map((e) => (
                  <ToastForm
                    key={e.id}
                    action={setReportAccessAction}
                    className="flex flex-col gap-2 rounded-xl border border-white/30 bg-white/40 p-3"
                  >
                    <input type="hidden" name="enrollment_id" value={e.id} />
                    <p className="text-sm font-medium text-[#17263D]">
                      {e.program.name} <span className="font-normal text-slate-500">· {STATUS_LABEL[e.status]}</span>
                    </p>
                    <label className="flex items-start gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        name="allow"
                        defaultChecked={e.report_access_granted_to_requester}
                        className="mt-1 h-4 w-4"
                      />
                      <span>Izinkan pendaftar melihat jadwal dan laporan kelas saya</span>
                    </label>
                    <GlassButton type="submit" className={`${SECONDARY_BUTTON} w-fit px-4 py-2 text-sm`}>
                      Simpan
                    </GlassButton>
                  </ToastForm>
                ))}
              </div>
            )}
          </GlassCard>
        );
      })}

      {registeredByMe.length > 0 && (
        <GlassCard>
          <h2 className={`mb-1 ${HEADING}`}>Peserta yang Anda Daftarkan</h2>
          <p className="mb-4 text-sm text-slate-600">
            Anda mengurus pendaftaran dan tagihan. Jadwal dan laporan kelas hanya tampil jika peserta mengizinkan.
          </p>
          <div className="flex flex-col gap-3">
            {registeredByMe.map((p) => {
              const own = enrollments.filter((e) => e.student_id === p.id && e.status !== "cancelled" && e.status !== "rejected");
              return (
                <div key={p.id} className="rounded-xl border border-white/30 bg-white/40 p-4">
                  <p className="text-sm font-semibold text-[#17263D]">
                    {p.full_name}
                    {p.relationship ? <span className="font-normal text-slate-500"> · {p.relationship}</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {genderLabel(p.gender)} ·{" "}
                    {p.user_id ? "Sudah membuat akun sendiri" : "Belum membuat akun (undangan dikirim lewat WhatsApp)"}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
                    {own.map((e) => (
                      <li key={e.id}>
                        {e.program.name} · {STATUS_LABEL[e.status]} ·{" "}
                        {e.report_access_granted_to_requester
                          ? "jadwal & laporan boleh Anda lihat"
                          : "jadwal & laporan pribadi"}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {children.length > 0 && (
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Data Anak</h2>
        <div className="flex flex-col gap-4">
          {children.map((child) => (
            <ToastForm
              key={child.id}
              action={updateChildProfileAction}
              className="flex flex-col gap-3 rounded-xl border border-white/30 bg-white/40 p-4"
            >
              <input type="hidden" name="student_id" value={child.id} />
              <input
                type="hidden"
                name="current_avatar_url"
                value={child.avatar_url ?? ""}
              />
              <div className="flex items-center gap-4">
                {child.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={child.avatar_url}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF9FB] text-xl">
                    🧒
                  </div>
                )}
                <input
                  type="file"
                  name="photo"
                  accept="image/*"
                  className="text-xs text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-[#35C5D0] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">
                    Nama Lengkap
                  </label>
                  <GlassInput
                    name="full_name"
                    defaultValue={child.full_name}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-slate-800">
                    Nama Panggilan
                  </label>
                  <GlassInput
                    name="nickname"
                    placeholder="Contoh: Kayla"
                    defaultValue={child.nickname ?? ""}
                  />
                </div>
              </div>
              <GlassButton type="submit" className={`${SECONDARY_BUTTON} w-fit px-4 py-2 text-sm`}>
                Simpan
              </GlassButton>
            </ToastForm>
          ))}
        </div>
      </GlassCard>
      )}
    </div>
  );
}
