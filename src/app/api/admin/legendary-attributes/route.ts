import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  validateArtworkEffectLinks,
  type ArtworkEffect,
  type ArtworkEffectParameter,
  type ArtworkEffectType,
} from "@/server/artwork-effects";
import { getDatabase } from "@/server/mongodb";

type EffectInput = {
  effectType?: unknown;
  linkedAttributes?: unknown;
  title?: unknown;
  description?: unknown;
  flavorText?: unknown;
  code?: unknown;
  active?: unknown;
  parameters?: unknown;
};

export function validateEffectInput(body: EffectInput) {
  const effectType = body.effectType as ArtworkEffectType;
  const linkedAttributes = Array.isArray(body.linkedAttributes)
    ? body.linkedAttributes.filter((id): id is string => typeof id === "string")
    : [];
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const flavorText =
    typeof body.flavorText === "string" ? body.flavorText.trim() : "";
  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (
    (effectType !== "legendary" && effectType !== "masterpiece") ||
    !title ||
    !description ||
    !flavorText ||
    !/^[A-Z][A-Z0-9_]*$/.test(code) ||
    typeof body.active !== "boolean" ||
    !isParameterRecord(body.parameters)
  ) {
    throw new Error("Artwork effect values are invalid.");
  }
  return {
    effectType,
    linkedAttributes: validateArtworkEffectLinks(effectType, linkedAttributes),
    title,
    description,
    flavorText,
    code,
    active: body.active,
    parameters: body.parameters,
  };
}

function isParameterRecord(
  value: unknown,
): value is Record<string, ArtworkEffectParameter> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) =>
        typeof entry === "boolean" ||
        typeof entry === "number" ||
        typeof entry === "string",
    )
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let input;
  try {
    input = validateEffectInput((await request.json()) as EffectInput);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid effect." },
      { status: 400 },
    );
  }
  const database = await getDatabase();
  const [duplicate, attributeCount] = await Promise.all([
    database.collection<ArtworkEffect>("artwork_effects").findOne({ code: input.code }),
    database.collection<{ _id: string; active: boolean }>("attributes").countDocuments({
      _id: { $in: [...input.linkedAttributes] },
      active: true,
    }),
  ]);
  if (duplicate) {
    return NextResponse.json({ error: "Behavior codes must be unique." }, { status: 409 });
  }
  if (attributeCount !== input.linkedAttributes.length) {
    return NextResponse.json({ error: "Select only active attributes." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const effect: ArtworkEffect = {
    _id: randomUUID(),
    effect_type: input.effectType,
    linked_attributes: input.linkedAttributes,
    title: input.title,
    description: input.description,
    flavor_text: input.flavorText,
    code: input.code,
    active: false,
    parameters: input.parameters,
    created_at: now,
    updated_at: now,
  };
  await database.collection<ArtworkEffect>("artwork_effects").insertOne(effect);
  return NextResponse.json(
    { status: "ok", effect, message: `Created inactive effect ${effect.title}.` },
    { status: 201 },
  );
}
