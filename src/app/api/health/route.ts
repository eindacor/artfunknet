import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });

    return NextResponse.json({
      status: "ok",
      database: {
        connected: true,
        name: database.databaseName,
      },
    });
  } catch (error) {
    console.error("MongoDB health check failed", error);

    return NextResponse.json(
      {
        status: "error",
        database: {
          connected: false,
        },
      },
      { status: 503 },
    );
  }
}
