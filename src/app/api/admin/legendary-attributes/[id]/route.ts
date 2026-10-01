import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import type { ArtworkEffect } from "@/server/artwork-effects";
import { getDatabase } from "@/server/mongodb";

import { validateEffectInput } from "../route";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const database = await getDatabase();
  const effect = await database
    .collection<ArtworkEffect>("artwork_effects")
    .findOne({ _id: id });
  if (!effect) {
    return NextResponse.json(
      { error: "Artwork effect was not found." },
      { status: 404 },
    );
  }
  const artworkCount = await database
    .collection<{ effect_id?: string }>("artworks")
    .countDocuments({ effect_id: id });
  if (artworkCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete ${effect.title} while ${artworkCount} artwork${artworkCount === 1 ? " references" : "s reference"} it.`,
      },
      { status: 409 },
    );
  }
  const deleted = await database
    .collection<ArtworkEffect>("artwork_effects")
    .deleteOne({ _id: id });
  if (deleted.deletedCount !== 1) {
    return NextResponse.json(
      { error: "The artwork effect changed before it could be deleted." },
      { status: 409 },
    );
  }
  console.info("Deleted artwork effect", {
    effectId: id,
    effectTitle: effect.title,
    deletedBy: auth.session.email,
  });
  return NextResponse.json({
    status: "ok",
    message: `Deleted effect ${effect.title}.`,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let input;
  try {
    input = validateEffectInput(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid effect." },
      { status: 400 },
    );
  }
  const { id } = await params;
  const database = await getDatabase();
  const [duplicate, attributeCount, existing, artworkCount] = await Promise.all([
    database
      .collection<ArtworkEffect>("artwork_effects")
      .findOne({ _id: { $ne: id }, code: input.code }),
    database.collection<{ _id: string; active: boolean }>("attributes").countDocuments({
      _id: { $in: [...input.linkedAttributes] },
      active: true,
    }),
    database.collection<ArtworkEffect>("artwork_effects").findOne({ _id: id }),
    database.collection<{ effect_id?: string }>("artworks").countDocuments({
      effect_id: id,
    }),
  ]);
  if (duplicate) {
    return NextResponse.json(
      { error: "Behavior codes must be unique." },
      { status: 409 },
    );
  }
  if (attributeCount !== input.linkedAttributes.length) {
    return NextResponse.json(
      { error: "Select only active attributes." },
      { status: 400 },
    );
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Artwork effect was not found." },
      { status: 404 },
    );
  }
  if (artworkCount > 0 && existing.effect_type !== input.effectType) {
    return NextResponse.json(
      { error: "An effect referenced by artwork cannot change type." },
      { status: 409 },
    );
  }
  const result = await database.collection<ArtworkEffect>("artwork_effects").updateOne(
    { _id: id },
    {
      $set: {
        effect_type: input.effectType,
        linked_attributes: input.linkedAttributes,
        title: input.title,
        description: input.description,
        flavor_text: input.flavorText,
        code: input.code,
        active: input.active,
        parameters: input.parameters,
        updated_at: new Date().toISOString(),
      },
    },
  );
  if (result.matchedCount !== 1) {
    return NextResponse.json({ error: "Artwork effect was not found." }, { status: 404 });
  }
  return NextResponse.json({ status: "ok" });
}
