import AdminHeader from "./admin-header";
import { requireAdmin } from "@/server/session";
import { AdminArtworkImages } from "@/components/artwork-image-scope";
import { getAdminReviewCounts } from "@/server/admin-review-counts";
import { getDatabase } from "@/server/mongodb";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdmin();
  const reviewCounts = await getAdminReviewCounts(await getDatabase());

  return (
    <AdminArtworkImages>
      <div className="min-h-screen">
        <AdminHeader email={session.email} reviewCounts={reviewCounts} />
        {children}
      </div>
    </AdminArtworkImages>
  );
}
