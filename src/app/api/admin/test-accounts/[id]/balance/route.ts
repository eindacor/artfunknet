import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";

type BalanceRequest = {
  balance?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as BalanceRequest;
  if (
    typeof body.balance !== "number" ||
    !Number.isSafeInteger(body.balance) ||
    body.balance < 0
  ) {
    return NextResponse.json(
      { error: "Test player balance must be a nonnegative whole number." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const now = new Date();
  const result = await (await getDatabase())
    .collection<{ _id: string }>("players")
    .updateOne(
      {
        _id: id,
        active: true,
        test_account: true,
      },
      {
        $set: {
          "profile.bank_balance": body.balance,
          "profile.last_activity": now.toISOString(),
          updated_at: now,
          updated_by: auth.session.email,
        },
      },
    );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The active test player could not be found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "ok",
    bankBalance: body.balance,
    message: `Test player balance set to $${body.balance.toLocaleString()}.`,
  });
}
