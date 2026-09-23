import { TabLinks } from "@/components/admin/ui";

const TABS = [
  { key: "ringkasan", label: "Ringkasan", href: "/admin/keuangan/ringkasan" },
  { key: "tagihan", label: "Tagihan", href: "/admin/keuangan/tagihan" },
  { key: "arus-kas", label: "Arus Kas", href: "/admin/keuangan/arus-kas" },
  { key: "biaya", label: "Biaya", href: "/admin/keuangan/biaya" },
  { key: "gaji-pengajar", label: "Gaji Pengajar", href: "/admin/gaji" },
  { key: "pajak", label: "Pajak & Kepatuhan", href: "/admin/keuangan/pajak" },
  { key: "export", label: "Export Laporan", href: "/admin/keuangan/export" },
];

export function KeuanganTabs({ active }: { active: string }) {
  return <TabLinks tabs={TABS} active={active} label="Bagian Keuangan" />;
}
