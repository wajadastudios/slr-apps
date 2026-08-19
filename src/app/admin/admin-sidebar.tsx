import { PortalSidebar } from "@/components/portal-sidebar";

const NAV_GROUPS = [
  { label: null, items: [{ href: "/admin", label: "Ringkasan" }] },
  {
    label: "Orang",
    items: [
      { href: "/admin/murid", label: "Siswa" },
      { href: "/admin/laporan", label: "Laporan" },
      { href: "/admin/pelatih", label: "Pengajar" },
      { href: "/admin/orang-tua", label: "Orang Tua" },
      { href: "/admin/pendaftar", label: "Pendaftar" },
      { href: "/admin/pengganti", label: "Pengajar Pengganti" },
    ],
  },
  {
    label: "Program",
    items: [
      { href: "/admin/program", label: "Program" },
      { href: "/admin/slot-jadwal", label: "Slot Jadwal" },
      { href: "/admin/jadwal", label: "Jadwal Siswa" },
      { href: "/admin/paket-harga", label: "Paket Harga" },
      { href: "/admin/lokasi-kolam", label: "Lokasi Kolam" },
    ],
  },
  {
    label: "Keuangan",
    items: [
      { href: "/admin/tagihan", label: "Tagihan" },
      { href: "/admin/gaji", label: "Gaji Pengajar" },
    ],
  },
  {
    label: "Konten",
    items: [
      { href: "/admin/testimoni", label: "Testimoni" },
      { href: "/admin/galeri", label: "Galeri" },
      { href: "/admin/media-ads", label: "Media Ads" },
      { href: "/admin/faq", label: "FAQ" },
      { href: "/admin/pengaturan", label: "Pengaturan" },
    ],
  },
];

export function AdminSidebar({ userLabel }: { userLabel: string }) {
  return (
    <PortalSidebar navGroups={NAV_GROUPS} homeHref="/admin" userLabel={userLabel} />
  );
}
