import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  deleteArtworkImageRecord,
  deleteArtworkObject,
  type ArtworkImageRecord,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";
import { logOperationalError } from "@/server/operational-logging";

type Submission = {
  _id: string;
  status: string;
  draft?: Record<string, unknown>;
  image?: {
    storage?: ArtworkStorageReference;
    variants?: ArtworkImageRecord;
  };
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = (await request.json()) as {
    action?: "save" | "reject";
    draft?: Record<string, unknown>;
  };

  if (body.action !== "save" && body.action !== "reject") {
    return NextResponse.json(
      { error: "Unsupported review action." },
      { status: 400 },
    );
  }

  const now = new Date();
  const database = await getDatabase();
  const collection = database.collection<Submission>("artwork_submissions");
  if (body.action === "reject") {
    const submission = await collection.findOneAndUpdate(
      { _id: id, status: { $ne: "approved" } },
      { $set: {
        status: "denying",
        "review.updated_at": now,
        "review.updated_by": auth.session.email,
      } },
      { returnDocument: "after" },
    );
    if (!submission) {
      return NextResponse.json(
        { error: "Submission was not found or is already approved." },
        { status: 404 },
      );
    }
    try {
      if (submission.image?.variants) {
        await deleteArtworkImageRecord(submission.image.variants);
      }
      if (submission.image?.storage) {
        await deleteArtworkObject(submission.image.storage);
      }
    } catch (error) {
      logOperationalError("artwork_submission.image_cleanup_failed", error, { submissionId: id });
      return NextResponse.json(
        { error: "Image cleanup could not finish. Retry rejecting this submission." },
        { status: 503 },
      );
    }
    const deleted = await collection.deleteOne({ _id: id, status: "denying" });
    if (deleted.deletedCount !== 1) {
      return NextResponse.json({ error: "The submission changed before it could be removed." }, { status: 409 });
    }
    return NextResponse.json({ status: "ok" });
  }
  const result = await collection.updateOne(
    { _id: id, status: { $nin: ["approved", "denying"] } },
    {
      $set: {
        draft: body.draft ?? {},
        status: "unverified",
        "review.updated_at": now,
        "review.updated_by": auth.session.email,
      },
    },
  );

  if (result.matchedCount === 0) {
    return NextResponse.json(
      { error: "Submission was not found or is already approved." },
      { status: 404 },
    );
  }

  return NextResponse.json({ status: "ok" });
}
