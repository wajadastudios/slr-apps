import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { WaterBg } from "@/components/water-bg";
import { AdminSidebar } from "./admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRole();

  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
      <WaterBg variant="dashboard" />
      <AdminSidebar userLabel={session.fullName ?? session.user.email ?? ""} />
      <main className="mx-auto w-full max-w-6xl flex-1">{children}</main>
    </div>
  );
}
