import { NextResponse } from "next/server";

import { getCardRendererCatalog } from "@/server/card-renderer-settings";
import { getDatabase } from "@/server/mongodb";

export async function GET() {
  try {
    const database = await getDatabase();
    return NextResponse.json({
      cosmetics: await getCardRendererCatalog(database),
    });
  } catch (error) {
    console.error("Unable to load art style names", error);
    return NextResponse.json(
      { error: "Art style names are unavailable." },
      { status: 500 },
    );
  }
}
