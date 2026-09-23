import { PortalSidebar } from "@/components/portal-sidebar";

// Grouped by how often they are used. Daily work stays open; configuration is
// folded until one of its pages is opened.
const NAV_GROUPS = [
  {
    label: "Operasional",
    defaultOpen: true,
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/pendaftar", label: "Pendaftar", also: ["/admin/pendaftar"] },
      { href: "/admin/murid", label: "Siswa", also: ["/admin/murid"] },
      { href: "/admin/jadwal", label: "Jadwal", also: ["/admin/jadwal"] },
      { href: "/admin/laporan", label: "Laporan", also: ["/admin/laporan"] },
    ],
  },
  {
    label: "Program",
    defaultOpen: true,
    items: [
      { href: "/admin/program/setup", label: "Program", also: ["/admin/program"] },
      { href: "/admin/penilaian", label: "Penilaian Program", also: ["/admin/penilaian", "/admin/milestone"] },
      { href: "/admin/paket-harga", label: "Paket" },
      { href: "/admin/slot-jadwal", label: "Slot" },
      { href: "/admin/lokasi-kolam", label: "Lokasi" },
    ],
  },
  {
    label: "Keuangan",
    defaultOpen: true,
    items: [
      { href: "/admin/keuangan/ringkasan", label: "Ringkasan" },
      { href: "/admin/tagihan", label: "Tagihan", also: ["/admin/keuangan/tagihan"] },
      { href: "/admin/keuangan/arus-kas", label: "Arus Kas" },
      { href: "/admin/keuangan/biaya", label: "Biaya" },
      { href: "/admin/gaji", label: "Gaji Pengajar", also: ["/admin/keuangan/gaji-pengajar"] },
      { href: "/admin/keuangan/pajak", label: "Pajak & Kepatuhan" },
      { href: "/admin/keuangan/export", label: "Export Laporan" },
    ],
  },
  {
    label: "Konfigurasi",
    items: [
      { href: "/admin/referral", label: "Referral" },
      { href: "/admin/pelatih", label: "Pengajar" },
      { href: "/admin/pengganti", label: "Pengajar Pengganti" },
      { href: "/admin/orang-tua", label: "Orang Tua" },
      { href: "/admin/testimoni", label: "Testimoni" },
      { href: "/admin/galeri", label: "Galeri" },
      { href: "/admin/media-ads", label: "Media Ads" },
      { href: "/admin/faq", label: "FAQ" },
      { href: "/admin/pengaturan", label: "Pengaturan" },
    ],
  },
];

export function AdminSidebar({ userLabel }: { userLabel: string }) {
  return <PortalSidebar navGroups={NAV_GROUPS} homeHref="/admin" userLabel={userLabel} />;
}
