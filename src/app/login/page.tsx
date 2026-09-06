import { redirect } from "next/navigation";

import { getAdminSession } from "@/server/session";

import LoginForm from "./login-form";

export default async function LoginPage() {
  if (await getAdminSession()) {
    redirect("/admin/artwork");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6">
      <div>
        <p className="game-title font-semibold text-[var(--accent)]">
          adminfunkel
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
