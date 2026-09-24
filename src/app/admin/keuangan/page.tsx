import { redirect } from "next/navigation";

// /admin/keuangan itself has no content of its own -- every real link in the
// app (sidebar, tabs) points straight at a subpage, but the bare parent path
// is still a plausible deep link/bookmark and previously 404'd.
export default function KeuanganIndexPage() {
  redirect("/admin/keuangan/ringkasan");
}
