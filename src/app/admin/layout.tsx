import AdminHeader from "./admin-header";
import { requireAdmin } from "@/server/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen">
      <AdminHeader email={session.email} />
      {children}
    </div>
  );
}
