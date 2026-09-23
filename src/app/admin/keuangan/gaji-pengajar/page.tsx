import { redirect } from "next/navigation";

// "Gaji Pengajar" lives at /admin/gaji (pre-existing, now upgraded with the
// draft/disetujui/dibayar/dibatalkan lifecycle) rather than being
// duplicated here -- this route exists only so the Keuangan nav entry has
// somewhere to point.
export default function KeuanganGajiPengajarRedirect() {
  redirect("/admin/gaji");
}
