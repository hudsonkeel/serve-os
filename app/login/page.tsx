import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Login | Serve OS",
  description: "Sign in to Serve OS.",
};

export default async function LoginPage() {
  const user = await getCurrentAuthorizedUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo variant="transparent" width={132} />
        </div>

        <section className="rounded-xl border border-ivory-border bg-white p-7 shadow-card">
          <p className="font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-gold-dark">
            Serve OS
          </p>
          <h1 className="mt-2 font-serif text-3xl font-light leading-tight text-navy">
            Welcome back.
          </h1>
          <p className="mt-2 font-sans text-sm leading-relaxed text-body">
            Sign in with your Serve Caregiving account.
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
