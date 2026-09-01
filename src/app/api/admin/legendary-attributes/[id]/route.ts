import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  recomputeLegendaryAssignments,
  type LegendaryAttribute,
  type LegendaryAttributeParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";

type UpdateRequest = {
  title?: unknown;
  description?: unknown;
  flavorText?: unknown;
  code?: unknown;
  active?: unknown;
  parameters?: unknown;
};

function isParameterRecord(
  value: unknown,
): value is Record<string, LegendaryAttributeParameter> {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as UpdateRequest;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const flavorText =
    typeof body.flavorText === "string" ? body.flavorText.trim() : "";
  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (
    !title ||
    !description ||
    !flavorText ||
    !/^[A-Z][A-Z0-9_]*$/.test(code) ||
    typeof body.active !== "boolean" ||
    !isParameterRecord(body.parameters)
  ) {
    return NextResponse.json(
      { error: "Legendary attribute values are invalid." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const duplicateCode = await database
    .collection<LegendaryAttribute>("unique_attributes")
    .findOne({ _id: { $ne: id }, code });
  if (duplicateCode) {
    return NextResponse.json(
      { error: "Behavior codes must be unique." },
      { status: 409 },
    );
  }

  const result = await database
    .collection<LegendaryAttribute>("unique_attributes")
    .updateOne(
      { _id: id },
      {
        $set: {
          title,
          description,
          flavor_text: flavorText,
          code,
          active: body.active,
          parameters: body.parameters,
          updated_at: new Date().toISOString(),
        },
      },
    );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "Legendary attribute was not found." },
      { status: 404 },
    );
  }

  await recomputeLegendaryAssignments(database);
  return NextResponse.json({ status: "ok" });
}
