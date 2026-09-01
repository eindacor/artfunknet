import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";

type Submission = {
  _id: string;
  status: string;
  draft?: Record<string, unknown>;
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
  const result = await database
    .collection<Submission>("artwork_submissions")
    .updateOne(
    { _id: id, status: { $ne: "approved" } },
    {
      $set: {
        ...(body.action === "save" ? { draft: body.draft ?? {} } : {}),
        status: body.action === "reject" ? "rejected" : "unverified",
        "review.updated_at": now,
        "review.updated_by": auth.session.email,
        ...(body.action === "reject"
          ? { "review.rejected_at": now }
          : {}),
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
