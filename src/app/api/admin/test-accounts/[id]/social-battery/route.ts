import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";
import {
  getNextSocialBatteryResetAt,
  SOCIAL_BATTERY_MAX,
} from "@/server/social-battery";

type SocialBatteryRequest = {
  socialBattery?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as SocialBatteryRequest;
  if (
    typeof body.socialBattery !== "number" ||
    !Number.isSafeInteger(body.socialBattery) ||
    body.socialBattery < 0 ||
    body.socialBattery > SOCIAL_BATTERY_MAX
  ) {
    return NextResponse.json(
      {
        error: `Test player social battery must be a whole number from 0 to ${SOCIAL_BATTERY_MAX.toLocaleString()}.`,
      },
      { status: 400 },
    );
  }

  const { id } = await params;
  const now = new Date();
  const resetAt = getNextSocialBatteryResetAt(now).toISOString();
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
          "profile.social_battery": body.socialBattery,
          "profile.social_battery_reset_at": resetAt,
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
    socialBattery: body.socialBattery,
    socialBatteryResetAt: resetAt,
    message: `Test player social battery set to ${body.socialBattery.toLocaleString()}.`,
  });
}
