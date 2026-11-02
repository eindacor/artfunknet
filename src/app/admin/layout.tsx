import AdminHeader from "./admin-header";
import { requireAdmin } from "@/server/session";
import { AdminArtworkImages } from "@/components/artwork-image-scope";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdmin();

  return (
    <AdminArtworkImages>
      <div className="min-h-screen">
        <AdminHeader email={session.email} />
        {children}
      </div>
    </AdminArtworkImages>
  );
}
