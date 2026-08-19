import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { TrialPaymentForm } from "@/components/trial-payment-form";

const HEADING = "font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg imageUrl={undefined} />
      <GlassCard className="w-full max-w-md">{children}</GlassCard>
    </div>
  );
}

export default async function TrialPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  type RegistrationSummary = {
    child_name: string;
    program_name: string | null;
    trial_session_date: string | null;
    trial_session_time: string | null;
    trial_location: string | null;
    trial_pelatih_name: string | null;
    trial_fee_status: string;
  };

  const [{ data: registration }, { data: settings }] = await Promise.all([
    supabase.rpc("get_registration_by_token", { p_token: token }).maybeSingle(),
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["trial_fee_amount", "qris_image_url", "bank_transfer_info"]),
  ]) as [{ data: RegistrationSummary | null }, { data: { key: string; value: string }[] | null }];

  if (!registration || !registration.trial_session_date) {
    return (
      <Shell>
        <h1 className={HEADING}>Link Tidak Valid</h1>
        <p className="mt-2 text-sm text-slate-700">
          Link pembayaran ini tidak ditemukan atau belum ada jadwal trial
          yang diatur. Hubungi admin jika Anda merasa ini keliru.
        </p>
        <Link href="/" className="mt-5 inline-block">
          <GlassButton>Kembali ke Beranda</GlassButton>
        </Link>
      </Shell>
    );
  }

  const get = (key: string) =>
    settings?.find((s) => s.key === key)?.value || "";
  const feeAmount = Number(get("trial_fee_amount")) || 50000;
  const qrisImageUrl = get("qris_image_url");
  const bankTransferInfo = get("bank_transfer_info");

  return (
    <Shell>
      <h1 className={HEADING}>Pembayaran Trial</h1>

      <div className="mt-4 flex flex-col gap-1 rounded-xl border border-white/30 bg-white/30 p-4 text-sm text-slate-700">
        <p>
          <span className="text-slate-500">Peserta:</span>{" "}
          <span className="font-medium text-[#17263D]">
            {registration.child_name}
          </span>
        </p>
        <p>
          <span className="text-slate-500">Program:</span>{" "}
          {registration.program_name ?? "-"}
        </p>
        <p>
          <span className="text-slate-500">Jadwal:</span>{" "}
          {registration.trial_session_date} pukul{" "}
          {String(registration.trial_session_time).slice(0, 5)}
        </p>
        {registration.trial_location && (
          <p>
            <span className="text-slate-500">Lokasi:</span>{" "}
            {registration.trial_location}
          </p>
        )}
        <p>
          <span className="text-slate-500">Pengajar:</span>{" "}
          {registration.trial_pelatih_name ?? "-"}
        </p>
      </div>

      <p className="mt-4 text-sm font-semibold text-[#17263D]">
        Biaya Trial: Rp{feeAmount.toLocaleString("id-ID")}
      </p>

      {registration.trial_fee_status === "paid" ? (
        <p className="mt-4 text-sm font-medium text-[#1a8f6f]">
          ✅ Pembayaran sudah dikonfirmasi. Sampai jumpa di sesi trial!
        </p>
      ) : (
        <>
          {qrisImageUrl && (
            <div className="mt-3 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrisImageUrl}
                alt="QRIS Sari Les Renang"
                className="w-40 rounded-xl border border-white/40 bg-white object-contain"
              />
            </div>
          )}
          {bankTransferInfo && (
            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
              {bankTransferInfo}
            </p>
          )}
          {!qrisImageUrl && !bankTransferInfo && (
            <p className="mt-3 text-sm text-slate-600">
              Info pembayaran belum tersedia, silakan hubungi admin.
            </p>
          )}

          <div className="mt-4">
            <TrialPaymentForm token={token} />
          </div>
        </>
      )}
    </Shell>
  );
}
