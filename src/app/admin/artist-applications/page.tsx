import { getDatabase } from "@/server/mongodb";
import type { ArtistApplication } from "@/server/artist-types";
import ApplicationReviews from "./application-reviews";

export const dynamic = "force-dynamic";

export default async function ArtistApplicationsPage() {
  const applications = await (await getDatabase()).collection<ArtistApplication>("artist_applications")
    .find({ status: { $in: ["pending", "approving"] } }, { projection: { credentials: 0 } })
    .sort({ created_at: 1 }).toArray();
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
    <h1 className="text-3xl font-bold">Artist applications</h1>
    <p className="text-[var(--muted)]">Review applicant details and portfolios. Approval creates an artist record and creates or upgrades the associated player account.</p>
    <ApplicationReviews applications={applications.map(application => {
      const storedDate: unknown = application.created_at;
      const date = storedDate instanceof Date ? storedDate : typeof storedDate === "string" ? new Date(storedDate) : null;
      return {
        id: application._id, name: application.name, email: application.email,
        dateOfBirth: application.date_of_birth, portfolioUrl: application.portfolio_url,
        bio: application.bio, screenName: application.screen_name, existingPlayer: application.existing_player,
        submittedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null, status: application.status,
      };
    })} />
  </main>;
}
