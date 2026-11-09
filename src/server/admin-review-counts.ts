import type { Db } from "mongodb";

export type AdminReviewCounts = {
  artistApplications: number;
  artworkSubmissions: number;
  chatReports: number;
};

export async function getAdminReviewCounts(database: Db): Promise<AdminReviewCounts> {
  const [artistApplications, newArtwork, artworkChanges, chatReports] = await Promise.all([
    database.collection("artist_applications").countDocuments({
      status: { $in: ["pending", "approving"] },
    }),
    database.collection("artworks").countDocuments({
      submission_status: "pending",
      active: false,
    }),
    database.collection("artwork_change_requests").countDocuments({
      status: { $in: ["pending", "approving"] },
    }),
    database.collection("gallery_chat_messages").countDocuments({
      reported: true,
      moderated_at: { $exists: false },
    }),
  ]);
  return {
    artistApplications,
    artworkSubmissions: newArtwork + artworkChanges,
    chatReports,
  };
}
