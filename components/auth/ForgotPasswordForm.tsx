"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

type SubmitState = "idle" | "submitting" | "success" | "error";

function createBrowserAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
      },
    }
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus("error");
      setError("Enter your email address.");
      return;
    }

    setStatus("submitting");
    const supabase = createBrowserAuthClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (resetError) {
      console.error("[auth:forgot-password]", resetError);
      setStatus("error");
      setError("We could not send a reset link. Please try again.");
      return;
    }

    setStatus("success");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-lg border border-ivory-border bg-surface px-4 font-sans text-sm text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60"
          placeholder="name@servecaregiving.com"
        />
      </div>

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
          Check your email for a password reset link.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy px-5 font-sans text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? "Sending link..." : "Send reset link"}
        {status !== "submitting" && <ArrowRight className="h-4 w-4" />}
      </button>

      <Link
        href="/login"
        className="block text-center font-sans text-xs text-muted underline-offset-4 transition-colors hover:text-body hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
