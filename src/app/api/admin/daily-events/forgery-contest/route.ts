import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  ForgeryContestError,
  getForgeryContestAdminView,
  replaceForgeryContestPrize,
  type ForgeryContestPlace,
} from "@/server/forgery-contest";
import { getDatabase } from "@/server/mongodb";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(
      await getForgeryContestAdminView(await getDatabase()),
    );
  } catch (error) {
    return contestErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    place?: unknown;
  } | null;
  if (
    typeof body?.place !== "number" ||
    ![1, 2, 3].includes(body.place)
  ) {
    return NextResponse.json(
      { error: "Choose first, second, or third place." },
      { status: 400 },
    );
  }

  try {
    await replaceForgeryContestPrize(
      await getDatabase(),
      body.place as ForgeryContestPlace,
    );
    return NextResponse.json({
      status: "ok",
      message: `${ordinal(body.place)} place prize replaced.`,
    });
  } catch (error) {
    return contestErrorResponse(error);
  }
}

function ordinal(place: number) {
  return place === 1 ? "First" : place === 2 ? "Second" : "Third";
}

function contestErrorResponse(error: unknown) {
  if (error instanceof ForgeryContestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error("Forgery Contest admin request failed", error);
  return NextResponse.json(
    { error: "The Forgery Contest is temporarily unavailable." },
    { status: 500 },
  );
}
