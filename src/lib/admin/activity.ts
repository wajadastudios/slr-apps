import { dayName, formatClock, rupiah } from "./format";
import { AUDIENCE_SHORT } from "@/lib/program-audience";

export type ActivityRow = {
  id: string;
  created_at: string;
  actor_name: string | null;
  entity_type: string;
  action: "insert" | "update" | "delete" | "note";
  changes: Record<string, unknown>;
  note: string | null;
};

const ENTITY: Record<string, string> = {
  enrollments: "Pendaftaran kelas",
  class_slots: "Slot jadwal",
  schedules: "Peserta di slot",
  invoices: "Tagihan",
  programs: "Program",
  program_packages: "Paket harga",
  package_price_versions: "Versi harga paket",
  enrollment_price_locks: "Harga peserta terkunci",
  indicators: "Indikator",
  indicator_groups: "Kelompok indikator",
  milestones: "Milestone",
  reminder: "Pengingat",
  followup: "Follow-up",
};

const FIELD: Record<string, string> = {
  status: "status",
  slot_id: "slot",
  offered_slot_id: "slot yang ditawarkan",
  billing_mode: "penanggung jawab pembayaran",
  billing_contact_user_id: "akun penagih",
  day_of_week: "hari",
  start_time: "jam",
  duration_minutes: "durasi (menit)",
  pelatih_id: "pengajar",
  location: "lokasi",
  capacity: "kapasitas",
  label: "tipe kelas",
  amount: "nominal",
  sessions_count: "jumlah sesi",
  package_name: "paket",
  name: "nama",
  active: "aktif",
  registration_open: "menerima pendaftar",
  audience: "jalur pendaftaran",
  self_registration: "pendaftaran mandiri",
  price: "harga",
  currency: "mata uang",
  effective_from: "berlaku sejak",
  effective_until: "berlaku sampai",
  note: "catatan",
  reason: "alasan",
  base_price: "harga dasar",
  discount_amount: "diskon",
  discount_type: "jenis diskon",
  price_source: "sumber harga",
  override_reason: "alasan override",
  revision_reason: "alasan revisi",
  internal_note: "catatan internal",
  program_package_id: "paket",
  package_price_version_id: "versi harga",
  enrollment_price_lock_id: "harga peserta terkunci",
  supersedes_invoice_id: "merevisi tagihan",
  superseded_by_invoice_id: "digantikan tagihan",
  followed_up_at: "follow-up",
  adjustment_note: "catatan penyesuaian",
};

const STATUS: Record<string, string> = {
  pending_review: "Perlu ditinjau",
  waiting_schedule: "Menunggu jadwal",
  schedule_offered: "Jadwal ditawarkan",
  scheduled: "Terjadwal",
  active: "Aktif",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
  draft: "Draft",
  approved: "Disetujui",
  sent: "Menunggu pembayaran",
  processing: "Diverifikasi",
  paid: "Lunas",
  expired: "Kedaluwarsa",
  superseded: "Direvisi",
};

export type NameLookup = (kind: "user" | "slot", id: string) => string | undefined;

function show(field: string, value: unknown, lookup?: NameLookup): string {
  if (value === null || value === undefined || value === "") return "kosong";
  if (field === "status") return STATUS[String(value)] ?? String(value);
  if (field === "day_of_week") return dayName(Number(value));
  if (field === "start_time") return formatClock(String(value));
  if (field === "amount" || field === "price" || field === "base_price" || field === "discount_amount") return rupiah(Number(value));
  if (field === "price_source") return { package: "Harga terbaru", enrollment_lock: "Harga peserta", override: "Override admin" }[String(value)] ?? String(value);
  if (field === "active" || field === "registration_open") return value ? "ya" : "tidak";
  if (field === "pelatih_id" || field === "billing_contact_user_id") {
    return lookup?.("user", String(value)) ?? "pengguna lain";
  }
  if (field === "slot_id" || field === "offered_slot_id") return lookup?.("slot", String(value)) ?? "slot lain";
  if (field === "audience") return AUDIENCE_SHORT[String(value) as keyof typeof AUDIENCE_SHORT] ?? String(value);
  if (field === "self_registration") return value ? "aktif" : "tidak aktif";
  if (field === "followed_up_at") return "ditandai";
  return String(value);
}

// One human sentence (plus the changed fields) for a log row.
export function describeActivity(row: ActivityRow, lookup?: NameLookup): { title: string; detail: string[] } {
  const what = ENTITY[row.entity_type] ?? row.entity_type;
  const c = row.changes;
  // the participant this entry is about, recorded when it happened
  const who = typeof c._student === "string" ? ` · ${c._student}` : "";
  if (row.action === "note") return { title: `${what}: ${row.note ?? ""}`, detail: [] };

  if (row.action === "insert") {
    const extra =
      row.entity_type === "invoices"
        ? `${String(c.package_name ?? "")} ${c.amount != null ? rupiah(Number(c.amount)) : ""}`.trim()
        : row.entity_type === "enrollment_price_locks" || row.entity_type === "package_price_versions"
          ? `${c.price != null ? rupiah(Number(c.price)) : ""}${c.reason ? ` · ${String(c.reason)}` : c.note ? ` · ${String(c.note)}` : ""}`.trim()
          : row.entity_type === "class_slots"
          ? `${dayName(Number(c.day_of_week))} ${formatClock(String(c.start_time ?? ""))}${c.location ? ` · ${String(c.location)}` : ""}`
          : row.entity_type === "schedules" && c.slot_id
            ? (lookup?.("slot", String(c.slot_id)) ?? "")
            : row.entity_type === "enrollments" && c.status
              ? show("status", c.status)
              : c.name
                ? String(c.name)
                : "";
    return { title: `${what} dibuat${extra ? `: ${extra}` : ""}${who}`, detail: [] };
  }

  if (row.action === "delete") {
    const extra =
      row.entity_type === "class_slots"
        ? `${dayName(Number(c.day_of_week))} ${formatClock(String(c.start_time ?? ""))}`
        : row.entity_type === "schedules" && c.slot_id
          ? (lookup?.("slot", String(c.slot_id)) ?? "")
          : "";
    return { title: `${what} dihapus${extra ? `: ${extra}` : ""}${who}`, detail: [] };
  }

  const detail = Object.entries(c)
    .filter(([field]) => !field.startsWith("_"))
    .map(([field, v]) => {
    const [before, after] = v as [unknown, unknown];
    return `${FIELD[field] ?? field}: ${show(field, before, lookup)} → ${show(field, after, lookup)}`;
  });
  return { title: `${what} diubah${who}`, detail };
}
