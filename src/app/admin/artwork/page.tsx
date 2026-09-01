import { getDatabase } from "@/server/mongodb";

import ArtworkReviewPortal, {
  type ArtistOption,
  type SubmissionView,
} from "./review-portal";

type SubmissionDocument = {
  _id: string;
  status: string;
  draft?: Record<string, unknown>;
  image: {
    storage?: {
      key: string;
    };
    sources: Array<{
      original_filename: string;
      relative_path?: string;
    }>;
  };
  review: {
    imported_at: Date;
  };
};

type AttributeDocument = {
  _id: string;
  npc_name: string;
  active: boolean;
};

export const dynamic = "force-dynamic";

export default async function ArtworkAdminPage() {
  const database = await getDatabase();
  const [submissionDocuments, artistDocuments, attributeDocuments] =
    await Promise.all([
    database
      .collection<SubmissionDocument>("artwork_submissions")
      .find({ status: { $in: ["unverified", "rejected"] } })
      .sort({ "review.imported_at": 1 })
      .toArray(),
    database
      .collection("artists")
      .find({}, { projection: { artist_name: 1 } })
      .sort({ artist_name: 1 })
      .toArray(),
    database
      .collection<AttributeDocument>("attributes")
      .find({ active: true })
      .sort({ npc_name: 1 })
      .toArray(),
  ]);

  const submissions: SubmissionView[] = submissionDocuments.map(
    (submission) => ({
      id: submission._id,
      status: submission.status,
      draft: submission.draft ?? {},
      importedAt: submission.review.imported_at.toISOString(),
      sources: submission.image.sources.map((source) => ({
        filename: source.original_filename,
        path:
          source.relative_path ??
          `S3: ${submission.image.storage?.key ?? "artwork intake"}`,
      })),
    }),
  );
  const artists: ArtistOption[] = artistDocuments.map((artist) => ({
    id: artist._id.toString(),
    name: String(artist.artist_name),
  }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Artwork intake</h1>
        <p className="mt-2 text-[var(--muted)]">
          Review local images, create or select an artist, and approve complete
          artwork records for use by the game.
        </p>
      </div>
      <ArtworkReviewPortal
        initialAttributes={attributeDocuments.map((attribute) => ({
          id: attribute._id,
          name: attribute.npc_name,
        }))}
        initialArtists={artists}
        initialSubmissions={submissions}
      />
    </main>
  );
}
