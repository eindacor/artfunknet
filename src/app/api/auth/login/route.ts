import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { verifyPassword } from "@/server/password";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
} from "@/server/session";

type AdminUser = {
  _id: string;
  email: string;
  active: boolean;
  password_salt: string;
  password_hash: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const admin = await database
    .collection<AdminUser>("admin_users")
    .findOne({ _id: email });
  const valid =
    admin?.active === true &&
    (await verifyPassword(
      password,
      admin.password_salt,
      admin.password_hash,
    ));

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid administrator credentials." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ status: "ok" });
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    await createAdminSessionToken(admin.email),
    adminSessionCookieOptions,
  );

  return response;
}
