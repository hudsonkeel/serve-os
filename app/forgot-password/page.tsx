import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot Password | Serve OS",
  description: "Reset your Serve OS password.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo variant="transparent" width={132} />
        </div>

        <section className="rounded-xl border border-ivory-border bg-surface p-7 shadow-card">
          <p className="font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-gold-dark">
            Serve OS
          </p>
          <h1 className="mt-2 font-serif text-3xl font-light leading-tight text-body">
            Reset your password.
          </h1>
          <p className="mt-2 font-sans text-sm leading-relaxed text-body">
            Enter your Serve Caregiving email and we will send a secure reset link.
          </p>

          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
        </section>
      </div>
    </main>
  );
}
