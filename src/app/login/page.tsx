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
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
          Artfunkel administration
        </p>
        <h1 className="mt-3 text-4xl font-bold">Sign in</h1>
        <p className="mt-3 text-[var(--muted)]">
          Use the administrator credentials configured in your local
          environment file.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
