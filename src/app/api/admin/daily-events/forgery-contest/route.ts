import { NextResponse } from "next/server";

import { getCardCosmetic } from "@/components/item-cards/catalog";
import { requireAdminApi } from "@/server/admin-api";
import {
  createForgeryContestBufferedPrize,
  ForgeryContestError,
  getForgeryContestAdminView,
  removeForgeryContestBufferedPrize,
  replaceForgeryContestPrize,
  updateForgeryContestBufferedPrize,
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
    action?: unknown;
  } | null;
  if (
    !body ||
    !isContestPlace(body.place) ||
    (body.action !== undefined &&
      body.action !== "replace" &&
      body.action !== "create")
  ) {
    return NextResponse.json(
      { error: "Choose first, second, or third place." },
      { status: 400 },
    );
  }

  try {
    const database = await getDatabase();
    if (body.action === "create") {
      await createForgeryContestBufferedPrize(database, body.place);
    } else {
      await replaceForgeryContestPrize(database, body.place);
    }
    return NextResponse.json({
      status: "ok",
      message:
        body.action === "create"
          ? `${ordinal(body.place)} place buffer item created.`
          : `${ordinal(body.place)} place prize replaced from its buffer.`,
    });
  } catch (error) {
    return contestErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    place?: unknown;
    itemId?: unknown;
    artworkId?: unknown;
    condition?: unknown;
    itemLevel?: unknown;
    foil?: unknown;
    unlocked?: unknown;
    mint?: unknown;
    seasonal?: unknown;
    cardRenderer?: unknown;
    pool?: unknown;
  } | null;
  if (body?.pool !== undefined && body.pool !== "buffer") {
    return NextResponse.json(
      { error: "Live Forgery Contest prizes cannot be edited." },
      { status: 409 },
    );
  }
  const cardRenderer =
    typeof body?.cardRenderer === "string"
      ? getCardCosmetic(body.cardRenderer)
      : undefined;
  if (
    !body ||
    !isContestPlace(body.place) ||
    typeof body.itemId !== "string" ||
    !body.itemId ||
    typeof body.artworkId !== "string" ||
    typeof body.condition !== "number" ||
    !Number.isFinite(body.condition) ||
    body.condition < 0 ||
    body.condition > 1 ||
    typeof body.itemLevel !== "number" ||
    !Number.isInteger(body.itemLevel) ||
    body.itemLevel < 1 ||
    body.itemLevel > 100 ||
    typeof body.foil !== "boolean" ||
    typeof body.unlocked !== "boolean" ||
    typeof body.mint !== "boolean" ||
    typeof body.seasonal !== "boolean" ||
    !cardRenderer ||
    cardRenderer.id === "museum"
  ) {
    return NextResponse.json(
      { error: "Provide valid buffered Forgery Contest prize properties." },
      { status: 400 },
    );
  }
  try {
    const item = await updateForgeryContestBufferedPrize(
      await getDatabase(),
      body.place,
      body.itemId,
      {
        artworkId: body.artworkId,
        condition: body.condition,
        itemLevel: body.itemLevel,
        foil: body.foil,
        unlocked: body.unlocked,
        mint: body.mint,
        seasonal: body.seasonal,
        cardRenderer: cardRenderer.id,
      },
    );
    return NextResponse.json({
      status: "ok",
      message: "Buffered Forgery Contest prize updated.",
      item,
    });
  } catch (error) {
    return contestErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    place?: unknown;
    itemId?: unknown;
  } | null;
  if (
    !body || !isContestPlace(body.place) ||
    typeof body.itemId !== "string" || !body.itemId
  ) {
    return NextResponse.json(
      { error: "Choose a buffered prize for first, second, or third place." },
      { status: 400 },
    );
  }
  try {
    await removeForgeryContestBufferedPrize(
      await getDatabase(), body.place, body.itemId,
    );
    return NextResponse.json({
      status: "ok",
      message: "Buffered Forgery Contest prize removed.",
    });
  } catch (error) {
    return contestErrorResponse(error);
  }
}

function isContestPlace(value: unknown): value is ForgeryContestPlace {
  return typeof value === "number" && [1, 2, 3].includes(value);
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
